import os
import json
import sqlite3
import secrets
import uuid
import requests as http_req
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from flask import Flask, jsonify, request, send_from_directory, send_file, abort, session, make_response
from flask_cors import CORS

STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static')
app = Flask(__name__, static_folder=None)
app.secret_key = os.environ.get('SECRET_KEY', 'trad-dev-secret-change-in-prod')
CORS(app, supports_credentials=True)

DATA_DIR = os.environ.get('DATA_DIR', 'data')
DB_PATH = os.path.join(DATA_DIR, 'tunes.db')
RECORDINGS_DIR = os.path.join(DATA_DIR, 'recordings')
ALLOWED_AUDIO_EXTS = {'.webm', '.ogg', '.mp3', '.mp4', '.m4a', '.wav', '.aac', '.flac'}


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    return conn

def get_current_user_id():
    """Return the active user_id from the session cookie (default 1 = Chris)."""
    return session.get('user_id', 1)


def clean_abc(val):
    if not val:
        return None
    stripped = val.strip()
    return stripped or None



import unicodedata, re as _re

def _normalize_title(title):
    """Lowercase, strip accents, remove leading articles, strip punctuation."""
    t = title.strip().lower()
    # strip accents
    t = ''.join(c for c in unicodedata.normalize('NFD', t) if unicodedata.category(c) != 'Mn')
    # remove punctuation except spaces
    t = _re.sub(r"[^a-z0-9 ]", '', t)
    # remove leading articles
    t = _re.sub(r'^(the|a|an) ', '', t).strip()
    # collapse spaces
    t = _re.sub(r'\s+', ' ', t)
    return t

def _token_overlap(a, b):
    ta, tb = set(a.split()), set(b.split())
    if not ta or not tb: return 0.0
    return len(ta & tb) / len(ta | tb)

def _find_dupe_pairs(conn, tune_id=None, same_key_is_dupe=True):
    tunes = conn.execute('SELECT id, title, tune_type, tune_key FROM tunes ORDER BY id').fetchall()
    pairs = []
    seen = set()
    for i, a in enumerate(tunes):
        for b in tunes[i+1:]:
            if tune_id and a['id'] != tune_id and b['id'] != tune_id:
                continue
            key = (min(a['id'], b['id']), max(a['id'], b['id']))
            if key in seen: continue
            seen.add(key)
            na, nb = _normalize_title(a['title']), _normalize_title(b['title'])
            overlap = _token_overlap(na, nb)
            exact = (na == nb)
            prefix = (na.startswith(nb) or nb.startswith(na)) if na != nb else False
            type_match = (a['tune_type'] == b['tune_type'])
            key_match = (a['tune_key'] and b['tune_key'] and
                         a['tune_key'].lower().rstrip('mix').rstrip('dor').strip() ==
                         b['tune_key'].lower().rstrip('mix').rstrip('dor').strip())
            # Confidence scoring
            if exact:
                confidence = 'high'
            elif prefix and type_match:
                confidence = 'high'
            elif overlap >= 0.7 and type_match:
                confidence = 'high' if same_key_is_dupe and key_match else 'medium'
            elif overlap >= 0.5 and type_match and same_key_is_dupe and key_match:
                confidence = 'medium'
            elif overlap >= 0.6:
                confidence = 'low'
            else:
                continue
            pairs.append({
                'tune_a': dict(a), 'tune_b': dict(b),
                'confidence': confidence, 'overlap': round(overlap, 2),
                'exact_normalized': exact
            })
    return pairs


import re as _re2, unicodedata as _ud

_CHROMATIC_SHARPS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
_CHROMATIC_FLATS  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']
_FLAT_SEMI        = {5,10,3,8,1,6}
_NOTE_BASE        = {'c':0,'d':2,'e':4,'f':5,'g':7,'a':9,'b':11}
_KEY_SEMI         = {'C':0,'G':7,'D':2,'A':9,'E':4,'B':11,'F#':6,'C#':1,'F':5,'Bb':10,'Eb':3,'Ab':8,'Db':1,'Gb':6}

def _root_semi(r): return _KEY_SEMI.get(r, 0)

def _parse_abc_key(key_str):
    k = key_str.strip()
    m = _re2.match(r'^([A-Ga-g][#b]?)\s*(.*)', k)
    if not m: return 'C', 'major', 0
    root = m.group(1); root = root[0].upper() + root[1:]
    mode = m.group(2).lower().strip()
    if 'mix' in mode:   mode = 'mixolydian'
    elif 'dor' in mode: mode = 'dorian'
    elif 'aeo' in mode: mode = 'aeolian'
    elif mode.startswith('m') and 'maj' not in mode: mode = 'minor'
    else: mode = 'major'
    return root, mode, _root_semi(root)

def _mode_sfx(mode): return {'major':'','minor':'min','mixolydian':'mix','dorian':'dor','aeolian':'aeo'}.get(mode,'')

def _new_key(root, mode, semitones):
    new_semi = (_root_semi(root) + semitones) % 12
    use_sharps = new_semi not in _FLAT_SEMI
    new_root = (_CHROMATIC_SHARPS if use_sharps else _CHROMATIC_FLATS)[new_semi]
    return new_root + _mode_sfx(mode), use_sharps

def _xp_note(letter, acc_str, oct_str, semitones, use_sharps):
    base = _NOTE_BASE.get(letter.lower(), 0)
    off = (2 if acc_str.startswith('^^') else 1 if acc_str.startswith('^')
           else -2 if acc_str.startswith('__') else -1 if acc_str.startswith('_') else 0)
    ns = (base + off + semitones) % 12
    nn = (_CHROMATIC_SHARPS if use_sharps else _CHROMATIC_FLATS)[ns]
    na = ('^' if '#' in nn else '_' if 'b' in nn else '') if len(nn)>1 else ''
    nl = nn[0].lower() if letter.islower() else nn[0].upper()
    return na + nl + oct_str

def _xp_body(text, semitones, use_sharps):
    res=[]; i=0
    while i < len(text):
        c = text[i]
        if c=='"':
            j=i+1
            while j<len(text) and text[j]!='"': j+=1
            res.append(text[i:j+1]); i=j+1; continue
        if c=='{':
            j=i+1
            while j<len(text) and text[j]!='}': j+=1
            res.append('{'+_xp_body(text[i+1:j],semitones,use_sharps)+'}'); i=j+1; continue
        if c in '^_' and i+1<len(text) and text[i+1].lower() in 'abcdefg':
            j=i
            while j<len(text) and text[j] in '^_': j+=1
            acc=text[i:j]; letter=text[j]; j+=1
            os=j
            while j<len(text) and text[j] in ",'": j+=1
            res.append(_xp_note(letter,acc,text[os:j],semitones,use_sharps)); i=j; continue
        if c=='=' and i+1<len(text) and text[i+1].lower() in 'abcdefg':
            letter=text[i+1]; j=i+2
            while j<len(text) and text[j] in ",'": j+=1
            res.append(_xp_note(letter,'=',text[i+2:j],semitones,use_sharps)); i=j; continue
        if c.lower() in 'abcdefg':
            j=i+1
            while j<len(text) and text[j] in ",'": j+=1
            res.append(_xp_note(c,'',text[i+1:j],semitones,use_sharps)); i=j; continue
        res.append(c); i+=1
    return ''.join(res)

def transpose_abc(abc_text, semitones, fallback_key='D', fallback_mode='major'):
    if not abc_text or semitones == 0: return abc_text
    lines = abc_text.split('\n'); result=[]; use_sharps=True; past_key=False
    has_key_line = any(l.strip().upper().startswith('K:') for l in lines)
    if not has_key_line:
        # Raw body — compute use_sharps from fallback key and just transpose all lines
        _, _, fallback_use_sharps = _parse_abc_key(fallback_key)
        _, use_sharps = _new_key(fallback_key, fallback_mode, semitones)
        return '\n'.join(_xp_body(l, semitones, use_sharps) for l in lines)
    for line in lines:
        s = line.strip()
        if s.upper().startswith('K:'):
            root, mode, _ = _parse_abc_key(s[2:])
            new_key_str, use_sharps = _new_key(root, mode, semitones)
            result.append('K:' + new_key_str); past_key=True; continue
        # Header line = single alpha char + colon, or comment
        if not past_key or (len(s)>=2 and s[0].isalpha() and s[1]==':') or s.startswith('%'):
            result.append(line); continue
        result.append(_xp_body(line, semitones, use_sharps))
    return '\n'.join(result)

def _extract_key_from_abc(abc_text):
    for line in (abc_text or '').split('\n'):
        if line.strip().upper().startswith('K:'):
            return line.strip()[2:].strip()
    return None

def init_db():
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(RECORDINGS_DIR, exist_ok=True)
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS tunes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            tune_type TEXT NOT NULL DEFAULT 'reel',
            tune_key TEXT,
            mode TEXT,
            abc_notation TEXT,
            thesession_id INTEGER,
            status TEXT NOT NULL DEFAULT 'want_to_learn',
            notes TEXT,
            last_practiced DATE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS practice_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tune_id INTEGER NOT NULL REFERENCES tunes(id) ON DELETE CASCADE,
            practiced_at DATE NOT NULL,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS sets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            tune_type TEXT NOT NULL DEFAULT 'mixed',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS set_tunes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            set_id INTEGER NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
            tune_id INTEGER NOT NULL REFERENCES tunes(id) ON DELETE CASCADE,
            position INTEGER NOT NULL DEFAULT 0,
            UNIQUE(set_id, tune_id)
        );
        CREATE TABLE IF NOT EXISTS recordings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tune_id INTEGER REFERENCES tunes(id) ON DELETE CASCADE,
            filename TEXT NOT NULL,
            original_name TEXT,
            mime_type TEXT,
            file_size INTEGER,
            notes TEXT,
            recording_type TEXT NOT NULL DEFAULT 'self',
            recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    """)
    conn.commit()
    # ── Users table ────────────────────────────────────────────────────────────
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id   INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        INSERT OR IGNORE INTO users (id, name) VALUES (1, 'Chris');
        INSERT OR IGNORE INTO users (id, name) VALUES (2, 'Tre');
    """)
    # Add user_id to owned tables (migration-safe)
    for table in ('tunes', 'sets', 'recordings'):
        try:
            conn.execute(f'ALTER TABLE {table} ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id)')
        except Exception:
            pass
    # Per-user settings: key namespaced to user
    try:
        conn.execute('ALTER TABLE settings ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1')
    except Exception:
        pass
    conn.commit()
    # Normalise any whitespace-only abc_notation left from earlier versions
    conn.execute("UPDATE tunes SET abc_notation = NULL WHERE abc_notation IS NOT NULL AND trim(abc_notation) = ''")
    try:
        conn.execute("ALTER TABLE recordings ADD COLUMN recording_type TEXT NOT NULL DEFAULT 'self'")
    except Exception:
        pass
    try:
        conn.execute("ALTER TABLE tunes ADD COLUMN source TEXT")
    except Exception:
        pass
    # Settings table for app-level config (share token etc)
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        """)
    except Exception:
        pass

    # ── Pairing tables ────────────────────────────────────────────────────────────
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS players (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                display_name TEXT NOT NULL DEFAULT 'Anonymous',
                cookie_token TEXT UNIQUE NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS pair_invites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT UNIQUE NOT NULL,
                player_id INTEGER NOT NULL REFERENCES players(id),
                prompt TEXT,
                statuses TEXT NOT NULL DEFAULT 'know_it,performance_ready',
                status TEXT NOT NULL DEFAULT 'open',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS pair_votes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                invite_id INTEGER NOT NULL REFERENCES pair_invites(id) ON DELETE CASCADE,
                voter_id INTEGER NOT NULL REFERENCES players(id),
                tune_id INTEGER NOT NULL REFERENCES tunes(id),
                vote INTEGER NOT NULL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(invite_id, voter_id, tune_id)
            );
        """)
    except Exception:
        pass

    # Friends tables
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS friends (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                type TEXT NOT NULL DEFAULT 'person',
                color TEXT NOT NULL DEFAULT 'green',
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS tune_friends (
                tune_id INTEGER NOT NULL REFERENCES tunes(id) ON DELETE CASCADE,
                friend_id INTEGER NOT NULL REFERENCES friends(id) ON DELETE CASCADE,
                added_via TEXT NOT NULL DEFAULT 'manual',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (tune_id, friend_id)
            );
        """)
    except Exception:
        pass

    # User-to-user friendships
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS user_friendships (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id_a INTEGER NOT NULL REFERENCES users(id),
                user_id_b INTEGER NOT NULL REFERENCES users(id),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id_a, user_id_b)
            );
        """)
    except Exception:
        pass

    # Tune research cache — keyed on normalised tune name, stores AI response JSON
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS tune_research_cache (
                tune_name TEXT PRIMARY KEY,
                result_json TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
    except Exception:
        pass

    conn.commit()
    conn.close()



@app.route('/api/share/token', methods=['GET'])
def get_share_token():
    conn = get_db()
    uid = get_current_user_id()
    row = conn.execute("SELECT value FROM settings WHERE key='share_token' AND user_id=?", (uid,)).fetchone()
    conn.close()
    return jsonify({'token': row['value'] if row else None})

@app.route('/api/share/token', methods=['POST'])
def create_share_token():
    data = request.get_json() or {}
    action = data.get('action', 'generate')
    conn = get_db()
    if action == 'revoke':
        uid = get_current_user_id()
        conn.execute("DELETE FROM settings WHERE key='share_token' AND user_id=?", (uid,))
        conn.commit()
        conn.close()
        return jsonify({'token': None})
    # Save config alongside token
    token = secrets.token_urlsafe(16)
    uid = get_current_user_id()
    conn.execute("INSERT OR REPLACE INTO settings (key, value, user_id) VALUES ('share_token', ?, ?)", (token, uid))
    conn.commit()
    conn.close()
    return jsonify({'token': token})

@app.route('/api/share/config', methods=['GET', 'POST'])
def share_config():
    conn = get_db()
    if request.method == 'POST':
        data = request.get_json() or {}
        uid = get_current_user_id()
        for key in ['share_statuses', 'share_label']:
            if key in data:
                conn.execute("INSERT OR REPLACE INTO settings (key, value, user_id) VALUES (?, ?, ?)",
                             (key, data[key], uid))
        conn.commit()
        conn.close()
        return jsonify({'ok': True})
    uid = get_current_user_id()
    rows = conn.execute("SELECT key, value FROM settings WHERE key IN ('share_statuses','share_label','share_token') AND user_id=?", (uid,)).fetchall()
    conn.close()
    cfg = {r['key']: r['value'] for r in rows}
    return jsonify(cfg)


# ── User-to-user friendships ──────────────────────────────────────────────────

@app.route('/api/user-friends', methods=['GET'])
def list_user_friends():
    uid = get_current_user_id()
    conn = get_db()
    rows = conn.execute(
        '''SELECT u.id, u.name FROM users u
           JOIN user_friendships uf ON u.id = CASE WHEN uf.user_id_a=? THEN uf.user_id_b ELSE uf.user_id_a END
           WHERE uf.user_id_a=? OR uf.user_id_b=?
           ORDER BY u.name''',
        (uid, uid, uid)
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/friend-connect/<token>', methods=['POST'])
def friend_connect(token):
    """Accept a share token from another user and create a mutual friendship."""
    uid = get_current_user_id()
    conn = get_db()
    # Find the user who owns this share token
    row = conn.execute("SELECT user_id FROM settings WHERE key='share_token' AND value=?", (token,)).fetchone()
    if not row:
        conn.close()
        return jsonify({'error': 'Invalid or expired link'}), 404
    other_uid = row['user_id']
    if other_uid == uid:
        conn.close()
        return jsonify({'error': 'Cannot friend yourself'}), 400
    a, b = min(uid, other_uid), max(uid, other_uid)
    try:
        conn.execute('INSERT OR IGNORE INTO user_friendships (user_id_a, user_id_b) VALUES (?,?)', (a, b))
        conn.commit()
    except Exception as e:
        conn.close()
        return jsonify({'error': str(e)}), 500
    other_user = conn.execute('SELECT id, name FROM users WHERE id=?', (other_uid,)).fetchone()
    conn.close()
    return jsonify({'ok': True, 'connected_with': dict(other_user) if other_user else None})


@app.route('/api/friend-connect/<token>', methods=['GET'])
def friend_connect_info(token):
    """Preview who owns this share token (for the connect prompt)."""
    uid = get_current_user_id()
    conn = get_db()
    row = conn.execute("SELECT user_id FROM settings WHERE key='share_token' AND value=?", (token,)).fetchone()
    if not row:
        conn.close()
        return jsonify({'error': 'Invalid link'}), 404
    other_uid = row['user_id']
    other_user = conn.execute('SELECT id, name FROM users WHERE id=?', (other_uid,)).fetchone()
    # Check if already friends
    a, b = min(uid, other_uid), max(uid, other_uid)
    existing = conn.execute('SELECT id FROM user_friendships WHERE user_id_a=? AND user_id_b=?', (a, b)).fetchone()
    conn.close()
    return jsonify({
        'owner': dict(other_user) if other_user else None,
        'already_friends': existing is not None,
        'is_self': other_uid == uid,
    })


@app.route('/api/user-friends/<int:friend_user_id>', methods=['DELETE'])
def remove_user_friend(friend_user_id):
    uid = get_current_user_id()
    a, b = min(uid, friend_user_id), max(uid, friend_user_id)
    conn = get_db()
    conn.execute('DELETE FROM user_friendships WHERE user_id_a=? AND user_id_b=?', (a, b))
    conn.commit()
    conn.close()
    return '', 204


@app.route('/api/friends-tunes', methods=['GET'])
def friends_tunes():
    """Tunes that friends have which the current user doesn't."""
    uid = get_current_user_id()
    conn = get_db()
    # Get all user-friends
    friend_rows = conn.execute(
        '''SELECT u.id, u.name FROM users u
           JOIN user_friendships uf ON u.id = CASE WHEN uf.user_id_a=? THEN uf.user_id_b ELSE uf.user_id_a END
           WHERE uf.user_id_a=? OR uf.user_id_b=?''',
        (uid, uid, uid)
    ).fetchall()
    if not friend_rows:
        conn.close()
        return jsonify([])
    # My tunes for de-duplication
    my_tunes = conn.execute('SELECT thesession_id, title FROM tunes WHERE user_id=?', (uid,)).fetchall()
    my_tsids = {t['thesession_id'] for t in my_tunes if t['thesession_id']}
    my_titles = {t['title'].lower().strip() for t in my_tunes}
    # Collect friend tunes not in my list, grouped by identity key
    result_map = {}  # key -> tune dict with user_friend_badges
    for fr in friend_rows:
        fuid = fr['id']
        fname = fr['name']
        f_tunes = conn.execute(
            'SELECT * FROM tunes WHERE user_id=?', (fuid,)
        ).fetchall()
        for ft in f_tunes:
            ft = dict(ft)
            tsid = ft.get('thesession_id')
            title_key = ft['title'].lower().strip()
            # Skip if current user already has this tune
            if tsid and tsid in my_tsids:
                continue
            if title_key in my_titles:
                continue
            # Identity key: prefer thesession_id
            ident = f'tsid:{tsid}' if tsid else f'title:{title_key}'
            if ident not in result_map:
                result_map[ident] = dict(ft)
                result_map[ident]['user_friend_badges'] = []
                result_map[ident]['friends'] = []
                # Remove friend-user-specific id so it doesn't conflict
                result_map[ident]['id'] = f'friend-{ident}'
            result_map[ident]['user_friend_badges'].append({
                'user_id': fuid, 'name': fname, 'status': ft['status']
            })
    conn.close()
    tunes = sorted(result_map.values(), key=lambda t: t['title'])
    return jsonify(tunes)


@app.route('/share/<token>')
def shared_list(token):
    conn = get_db()
    uid = get_current_user_id()
    row = conn.execute("SELECT value FROM settings WHERE key='share_token' AND user_id=?", (uid,)).fetchone()
    if not row or row['value'] != token:
        conn.close()
        abort(404)
    statuses_row = conn.execute("SELECT value FROM settings WHERE key='share_statuses'").fetchone()
    label_row = conn.execute("SELECT value FROM settings WHERE key='share_label'").fetchone()
    statuses = statuses_row['value'].split(',') if statuses_row else ['know_it', 'performance_ready']
    label = label_row['value'] if label_row else "Tune List"
    placeholders = ','.join('?' * len(statuses))
    tunes = conn.execute(
        f"SELECT title, tune_type, tune_key, mode, status FROM tunes WHERE status IN ({placeholders}) ORDER BY tune_type, title",
        statuses
    ).fetchall()
    conn.close()
    from collections import defaultdict
    by_type = defaultdict(list)
    for t in tunes:
        by_type[t['tune_type']].append(dict(t))
    if request.headers.get('Accept','').find('json') >= 0 or request.args.get('format') == 'json':
        return jsonify({'label': label, 'tunes': [dict(t) for t in tunes], 'by_type': dict(by_type)})
    # Render nice read-only HTML
    type_order = ['reel','jig','hornpipe','polka','slip jig','strathspey','waltz','march','air','other']
    rows_html = ''
    for ttype in type_order + [k for k in by_type if k not in type_order]:
        items = by_type.get(ttype)
        if not items: continue
        rows_html += f'<tr class=	ype-header\><td colspan=\>{ttype.title()}s ({len(items)})</td></tr>'
        for t in items:
            key_str = f'{t["tune_key"] or ""}  {t["mode"] or ""}'.strip()
            rows_html += f'<tr><td>{t["title"]}</td><td>{key_str}</td><td class=\status-{t["status"]}\>{t["status"].replace("_"," ").title()}</td></tr>'
    html = f"""<!DOCTYPE html>
<html lang=\"en\">
<head>
<meta charset=\"UTF-8\">
<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
<title>{label}</title>
<style>
*{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0;padding:1rem}}
h1{{color:#4ade80;margin-bottom:0.25rem;font-size:1.5rem}}
.sub{{color:#64748b;font-size:0.85rem;margin-bottom:1.5rem}}
table{{width:100%;border-collapse:collapse;font-size:0.9rem}}
th{{text-align:left;color:#94a3b8;padding:0.5rem 0.75rem;border-bottom:1px solid #1e293b;font-weight:600}}
td{{padding:0.45rem 0.75rem;border-bottom:1px solid #1e293b}}
tr:hover td{{background:#1e293b}}
tr.type-header td{{background:#134e2a;color:#4ade80;font-weight:700;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.05em;padding:0.6rem 0.75rem}}
.status-know_it{{color:#4ade80}}
.status-performance_ready{{color:#f59e0b}}
.status-learning{{color:#60a5fa}}
.status-want_to_learn{{color:#94a3b8}}
.footer{{margin-top:1.5rem;color:#475569;font-size:0.75rem;text-align:center}}
@media(max-width:480px){{td:last-child{{display:none}}}}
</style>
</head>
<body>
<h1>🎵 {label}</h1>
<p class=\"sub\">{len(tunes)} tunes &middot; read-only</p>
<table>
<thead><tr><th>Tune</th><th>Key</th><th>Status</th></tr></thead>
<tbody>{rows_html}</tbody>
</table>
<p class=\"footer\">Shared via Trad Session</p>
</body></html>"""
    from flask import Response
    return Response(html, mimetype='text/html')


@app.route('/api/users')
def list_users():
    conn = get_db()
    rows = conn.execute('SELECT id, name, created_at FROM users ORDER BY id').fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/me')
def me():
    uid = get_current_user_id()
    conn = get_db()
    row = conn.execute('SELECT id, name FROM users WHERE id = ?', (uid,)).fetchone()
    conn.close()
    if not row:
        return jsonify({'id': 1, 'name': 'Chris'})
    return jsonify(dict(row))

@app.route('/api/switch-user', methods=['POST'])
def switch_user():
    data = request.get_json() or {}
    uid = data.get('user_id')
    if not uid:
        return jsonify({'error': 'user_id required'}), 400
    conn = get_db()
    row = conn.execute('SELECT id, name FROM users WHERE id = ?', (uid,)).fetchone()
    conn.close()
    if not row:
        return jsonify({'error': 'User not found'}), 404
    session['user_id'] = row['id']
    resp = make_response(jsonify({'id': row['id'], 'name': row['name']}))
    return resp

@app.route('/health')
def health():
    return jsonify({'status': 'ok'})


@app.route('/api/stats')
def stats():
    conn = get_db()
    uid = get_current_user_id()
    by_status = conn.execute('SELECT status, COUNT(*) as count FROM tunes WHERE user_id=? GROUP BY status', (uid,)).fetchall()
    by_type = conn.execute('SELECT tune_type, COUNT(*) as count FROM tunes WHERE user_id=? GROUP BY tune_type', (uid,)).fetchall()
    total = conn.execute('SELECT COUNT(*) as count FROM tunes WHERE user_id=?', (uid,)).fetchone()
    conn.close()
    return jsonify({
        'total': total['count'],
        'by_status': {r['status']: r['count'] for r in by_status},
        'by_type': {r['tune_type']: r['count'] for r in by_type},
    })


@app.route('/api/tunes', methods=['GET'])
def list_tunes():
    uid = get_current_user_id()
    status = request.args.get('status')
    tune_type = request.args.get('type')
    key = request.args.get('key')
    search = request.args.get('q')
    friend_id = request.args.get('friend_id')        # old manual friend filter
    user_friend_id = request.args.get('user_friend_id')  # user-to-user friend filter
    if friend_id:
        query = 'SELECT t.* FROM tunes t JOIN tune_friends tf ON tf.tune_id = t.id WHERE tf.friend_id = ? AND t.user_id = ?'
        params = [friend_id, uid]
        if status:
            query += ' AND t.status = ?'; params.append(status)
        if tune_type:
            query += ' AND t.tune_type = ?'; params.append(tune_type)
        if key:
            query += ' AND t.tune_key = ?'; params.append(key)
        if search:
            query += ' AND t.title LIKE ?'; params.append(f'%{search}%')
        query += ' ORDER BY t.title ASC'
    elif user_friend_id:
        # Filter to tunes current user shares with specified friend user
        query = '''SELECT DISTINCT t.* FROM tunes t
            WHERE t.user_id = ?
            AND (
                (t.thesession_id IS NOT NULL AND t.thesession_id IN
                    (SELECT thesession_id FROM tunes WHERE user_id=? AND thesession_id IS NOT NULL))
                OR (lower(trim(t.title)) IN
                    (SELECT lower(trim(title)) FROM tunes WHERE user_id=?))
            )'''
        params = [uid, int(user_friend_id), int(user_friend_id)]
        if status:
            query += ' AND t.status = ?'; params.append(status)
        if tune_type:
            query += ' AND t.tune_type = ?'; params.append(tune_type)
        if key:
            query += ' AND t.tune_key = ?'; params.append(key)
        if search:
            query += ' AND t.title LIKE ?'; params.append(f'%{search}%')
        query += ' ORDER BY t.title ASC'
    else:
        query = 'SELECT * FROM tunes WHERE user_id = ?'
        params = [uid]
        if status:
            query += ' AND status = ?'; params.append(status)
        if tune_type:
            query += ' AND tune_type = ?'; params.append(tune_type)
        if key:
            query += ' AND tune_key = ?'; params.append(key)
        if search:
            query += ' AND title LIKE ?'; params.append(f'%{search}%')
        query += ' ORDER BY title ASC'
    conn = get_db()
    tunes = conn.execute(query, params).fetchall()
    tunes_list = [dict(t) for t in tunes]
    if tunes_list:
        tune_ids = [t['id'] for t in tunes_list]
        placeholders = ','.join('?' * len(tune_ids))
        # Old manual friend badges
        friend_rows = conn.execute(
            f'SELECT tf.tune_id, f.id, f.name, f.color FROM tune_friends tf '
            f'JOIN friends f ON f.id=tf.friend_id WHERE tf.tune_id IN ({placeholders}) ORDER BY f.name',
            tune_ids
        ).fetchall()
        friends_by_tune = {}
        for r in friend_rows:
            friends_by_tune.setdefault(r['tune_id'], []).append(
                {'id': r['id'], 'name': r['name'], 'color': r['color']}
            )
        for t in tunes_list:
            t['friends'] = friends_by_tune.get(t['id'], [])

        # User-friend badges: show linked users' status on same tunes
        user_friend_rows = conn.execute(
            '''SELECT u.id as friend_user_id, u.name as friend_name
               FROM user_friendships uf
               JOIN users u ON u.id = CASE WHEN uf.user_id_a=? THEN uf.user_id_b ELSE uf.user_id_a END
               WHERE uf.user_id_a=? OR uf.user_id_b=?''',
            (uid, uid, uid)
        ).fetchall()
        # Build lookup: for each friend user, their tunes keyed by thesession_id and lower(title)
        uf_badges_by_tune = {t['id']: [] for t in tunes_list}
        for fr in user_friend_rows:
            fuid = fr['friend_user_id']
            fname = fr['friend_name']
            f_tunes = conn.execute(
                'SELECT thesession_id, title, status FROM tunes WHERE user_id=?', (fuid,)
            ).fetchall()
            f_by_tsid = {ft['thesession_id']: ft['status'] for ft in f_tunes if ft['thesession_id']}
            f_by_title = {ft['title'].lower().strip(): ft['status'] for ft in f_tunes}
            for t in tunes_list:
                matched_status = None
                if t.get('thesession_id') and t['thesession_id'] in f_by_tsid:
                    matched_status = f_by_tsid[t['thesession_id']]
                elif t['title'].lower().strip() in f_by_title:
                    matched_status = f_by_title[t['title'].lower().strip()]
                if matched_status:
                    uf_badges_by_tune[t['id']].append({
                        'user_id': fuid, 'name': fname, 'status': matched_status
                    })
        for t in tunes_list:
            t['user_friend_badges'] = uf_badges_by_tune.get(t['id'], [])
    conn.close()
    return jsonify(tunes_list)


@app.route('/api/tunes', methods=['POST'])
def create_tune():
    data = request.get_json()
    if not data or not data.get('title'):
        abort(400)
    uid = get_current_user_id()
    conn = get_db()
    cur = conn.execute(
        'INSERT INTO tunes (title, tune_type, tune_key, mode, abc_notation, thesession_id, status, notes, source, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        (data['title'], data.get('tune_type', 'reel'), data.get('tune_key'),
         data.get('mode'), clean_abc(data.get('abc_notation')), data.get('thesession_id'),
         data.get('status', 'want_to_learn'), data.get('notes'), data.get('source'), uid)
    )
    conn.commit()
    tune = conn.execute('SELECT * FROM tunes WHERE id = ?', (cur.lastrowid,)).fetchone()
    same_key_is_dupe = data.get('same_key_is_dupe', True)
    dupes = _find_dupe_pairs(conn, tune_id=cur.lastrowid, same_key_is_dupe=same_key_is_dupe)
    conn.close()
    result = dict(tune)
    result['potential_dupes'] = dupes
    return jsonify(result), 201


@app.route('/api/tunes/<int:tune_id>', methods=['GET'])
def get_tune(tune_id):
    conn = get_db()
    tune = conn.execute('SELECT * FROM tunes WHERE id = ?', (tune_id,)).fetchone()
    conn.close()
    if not tune:
        abort(404)
    return jsonify(dict(tune))


@app.route('/api/tunes/<int:tune_id>', methods=['PUT'])
def update_tune(tune_id):
    data = request.get_json()
    if not data or not data.get('title'):
        abort(400)
    conn = get_db()
    tune = conn.execute('SELECT id FROM tunes WHERE id = ?', (tune_id,)).fetchone()
    if not tune:
        conn.close()
        abort(404)
    conn.execute(
        'UPDATE tunes SET title=?, tune_type=?, tune_key=?, mode=?, abc_notation=?, thesession_id=?, status=?, notes=?, source=?, last_practiced=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
        (data['title'], data.get('tune_type', 'reel'), data.get('tune_key'),
         data.get('mode'), clean_abc(data.get('abc_notation')), data.get('thesession_id'),
         data.get('status', 'want_to_learn'), data.get('notes'), data.get('source'),
         data.get('last_practiced'), tune_id)
    )
    conn.commit()
    tune = conn.execute('SELECT * FROM tunes WHERE id = ?', (tune_id,)).fetchone()
    conn.close()
    return jsonify(dict(tune))


@app.route('/api/tunes/<int:tune_id>', methods=['DELETE'])
def delete_tune(tune_id):
    conn = get_db()
    tune = conn.execute('SELECT id FROM tunes WHERE id = ?', (tune_id,)).fetchone()
    if not tune:
        conn.close()
        abort(404)
    recs = conn.execute('SELECT filename FROM recordings WHERE tune_id = ?', (tune_id,)).fetchall()
    for r in recs:
        try:
            os.remove(os.path.join(RECORDINGS_DIR, r['filename']))
        except OSError:
            pass
    conn.execute('DELETE FROM tunes WHERE id = ?', (tune_id,))
    conn.commit()
    conn.close()
    return '', 204



@app.route('/api/dupes', methods=['GET'])
def get_dupes():
    same_key_is_dupe = request.args.get('same_key_is_dupe', 'true').lower() != 'false'
    conn = get_db()
    pairs = _find_dupe_pairs(conn, same_key_is_dupe=same_key_is_dupe)
    conn.close()
    return jsonify(pairs)

@app.route('/api/dupes/resolve', methods=['POST'])
def resolve_dupe():
    data = request.get_json()
    action = data.get('action')  # keep_both | keep_a | keep_b | merge_into_a | merge_into_b
    id_a = data.get('id_a')
    id_b = data.get('id_b')
    if not action or not id_a or not id_b:
        abort(400)
    conn = get_db()
    a = conn.execute('SELECT * FROM tunes WHERE id = ?', (id_a,)).fetchone()
    b = conn.execute('SELECT * FROM tunes WHERE id = ?', (id_b,)).fetchone()
    if not a or not b:
        conn.close(); abort(404)

    if action == 'keep_both':
        pass
    elif action == 'keep_a':
        conn.execute('DELETE FROM tunes WHERE id = ?', (id_b,))
    elif action == 'keep_b':
        conn.execute('DELETE FROM tunes WHERE id = ?', (id_a,))
    elif action in ('merge_into_a', 'merge_into_b'):
        keep, drop = (a, b) if action == 'merge_into_a' else (b, a)
        # Copy non-null fields from drop into keep where keep has null
        for col in ['abc_notation', 'thesession_id', 'notes', 'source', 'tune_key', 'mode']:
            if not keep[col] and drop[col]:
                conn.execute(f'UPDATE tunes SET {col}=? WHERE id=?', (drop[col], keep['id']))
        # Reassign recordings and practice logs
        conn.execute('UPDATE recordings SET tune_id=? WHERE tune_id=?', (keep['id'], drop['id']))
        conn.execute('UPDATE practice_log SET tune_id=? WHERE tune_id=?', (keep['id'], drop['id']))
        conn.execute('DELETE FROM tunes WHERE id=?', (drop['id'],))
    else:
        conn.close(); abort(400)

    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/tunes/<int:tune_id>/transpose', methods=['POST'])
def save_transpose(tune_id):
    data = request.get_json()
    semitones = int(data.get('semitones', 0))
    new_title  = data.get('title')
    conn = get_db()
    tune = conn.execute('SELECT * FROM tunes WHERE id = ?', (tune_id,)).fetchone()
    if not tune:
        conn.close(); abort(404)
    if not tune['abc_notation']:
        conn.close()
        return jsonify({'error': 'No ABC notation to transpose'}), 400
    fkey = (tune['tune_key'] or 'D').split()[0]
    fmode = tune['mode'] or 'major'
    new_abc = transpose_abc(tune['abc_notation'], semitones, fkey, fmode)
    extracted = _extract_key_from_abc(new_abc)
    if extracted:
        new_key = extracted
    else:
        # No K: line — compute key from stored key + semitones
        root, mode, _ = _parse_abc_key(fkey)
        new_key_str, _ = _new_key(root, fmode, semitones)
        new_key = new_key_str
    title = new_title or tune['title']
    conn.execute(
        'UPDATE tunes SET abc_notation=?, tune_key=?, title=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
        (new_abc, new_key, title, tune_id)
    )
    conn.commit()
    updated = conn.execute('SELECT * FROM tunes WHERE id = ?', (tune_id,)).fetchone()
    conn.close()
    return jsonify(dict(updated))

@app.route('/api/tunes/<int:tune_id>/practice', methods=['GET'])
def get_practice_log(tune_id):
    conn = get_db()
    logs = conn.execute(
        'SELECT * FROM practice_log WHERE tune_id = ? ORDER BY practiced_at DESC LIMIT 50',
        (tune_id,)
    ).fetchall()
    conn.close()
    return jsonify([dict(l) for l in logs])


@app.route('/api/tunes/<int:tune_id>/practice', methods=['POST'])
def log_practice(tune_id):
    data = request.get_json() or {}
    practiced_at = data.get('practiced_at', datetime.now().strftime('%Y-%m-%d'))
    conn = get_db()
    tune = conn.execute('SELECT id FROM tunes WHERE id = ?', (tune_id,)).fetchone()
    if not tune:
        conn.close()
        abort(404)
    conn.execute('INSERT INTO practice_log (tune_id, practiced_at, notes) VALUES (?, ?, ?)',
                 (tune_id, practiced_at, data.get('notes')))
    conn.execute('UPDATE tunes SET last_practiced = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                 (practiced_at, tune_id))
    conn.commit()
    conn.close()
    return jsonify({'practiced_at': practiced_at}), 201


# ── Recordings ─────────────────────────────────────────────────────────────────

def _save_recording(tune_id):
    if 'audio' not in request.files:
        abort(400)
    file = request.files['audio']
    if not file.filename:
        abort(400)
    original_name = file.filename
    ext = os.path.splitext(original_name)[1].lower() or '.webm'
    if ext not in ALLOWED_AUDIO_EXTS:
        abort(415)
    os.makedirs(RECORDINGS_DIR, exist_ok=True)
    filename = str(uuid.uuid4()) + ext
    filepath = os.path.join(RECORDINGS_DIR, filename)
    file.save(filepath)
    file_size = os.path.getsize(filepath)
    notes = request.form.get('notes')
    recorded_at = request.form.get('recorded_at') or datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    conn = get_db()
    cur = conn.execute(
        'INSERT INTO recordings (tune_id, filename, original_name, mime_type, file_size, notes, recording_type, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        (tune_id, filename, original_name, file.content_type, file_size, notes, recording_type, recorded_at)
    )
    conn.commit()
    rec = conn.execute('SELECT * FROM recordings WHERE id = ?', (cur.lastrowid,)).fetchone()
    conn.close()
    return jsonify(dict(rec)), 201


@app.route('/api/tunes/<int:tune_id>/recordings', methods=['GET'])
def list_tune_recordings(tune_id):
    conn = get_db()
    recs = conn.execute(
        'SELECT * FROM recordings WHERE tune_id = ? ORDER BY recorded_at DESC',
        (tune_id,)
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in recs])


@app.route('/api/tunes/<int:tune_id>/recordings', methods=['POST'])
def upload_tune_recording(tune_id):
    conn = get_db()
    tune = conn.execute('SELECT id FROM tunes WHERE id = ?', (tune_id,)).fetchone()
    conn.close()
    if not tune:
        abort(404)
    return _save_recording(tune_id)


@app.route('/api/recordings', methods=['GET'])
def list_session_recordings():
    conn = get_db()
    recs = conn.execute(
        'SELECT * FROM recordings WHERE tune_id IS NULL ORDER BY recorded_at DESC'
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in recs])


@app.route('/api/recordings', methods=['POST'])
def upload_session_recording():
    return _save_recording(None)


@app.route('/api/recordings/<int:rec_id>/audio')
def serve_recording_audio(rec_id):
    conn = get_db()
    rec = conn.execute('SELECT * FROM recordings WHERE id = ?', (rec_id,)).fetchone()
    conn.close()
    if not rec:
        abort(404)
    filepath = os.path.join(RECORDINGS_DIR, rec['filename'])
    if not os.path.exists(filepath):
        abort(404)
    return send_file(filepath, mimetype=rec['mime_type'] or 'audio/webm')



@app.route('/api/recordings/<int:rec_id>', methods=['PATCH'])
def update_recording(rec_id):
    data = request.json
    conn = get_db()
    rec = conn.execute('SELECT * FROM recordings WHERE id = ?', (rec_id,)).fetchone()
    if not rec:
        abort(404)
    fields, vals = [], []
    if 'notes' in data:
        fields.append('notes = ?'); vals.append(data['notes'] or None)
    if 'recording_type' in data:
        fields.append('recording_type = ?'); vals.append(data['recording_type'])
    if fields:
        vals.append(rec_id)
        conn.execute('UPDATE recordings SET ' + ', '.join(fields) + ' WHERE id = ?', vals)
        conn.commit()
    rec = conn.execute('SELECT * FROM recordings WHERE id = ?', (rec_id,)).fetchone()
    return jsonify(dict(rec))

@app.route('/api/recordings/<int:rec_id>', methods=['DELETE'])
def delete_recording(rec_id):
    conn = get_db()
    rec = conn.execute('SELECT * FROM recordings WHERE id = ?', (rec_id,)).fetchone()
    if not rec:
        conn.close()
        abort(404)
    try:
        os.remove(os.path.join(RECORDINGS_DIR, rec['filename']))
    except OSError:
        pass
    conn.execute('DELETE FROM recordings WHERE id = ?', (rec_id,))
    conn.commit()
    conn.close()
    return '', 204



# ── The Session search proxy ───────────────────────────────────────────────────


# ── Sets API ──────────────────────────────────────────────────────────────────

def row_to_set(row, conn):
    s = dict(row)
    tunes = conn.execute(
        """SELECT t.* FROM tunes t
           JOIN set_tunes st ON st.tune_id = t.id
           WHERE st.set_id = ? ORDER BY st.position""",
        (s['id'],)
    ).fetchall()
    s['tunes'] = [dict(t) for t in tunes]
    if not s['name'] and s['tunes']:
        s['name'] = s['tunes'][0]['title'] + ' Set'
    return s


@app.route('/api/sets', methods=['GET'])
def list_sets():
    conn = get_db()
    rows = conn.execute('SELECT * FROM sets ORDER BY created_at DESC').fetchall()
    return jsonify([row_to_set(r, conn) for r in rows])


@app.route('/api/sets', methods=['POST'])
def create_set():
    data = request.json
    conn = get_db()
    cur = conn.execute(
        'INSERT INTO sets (name, tune_type) VALUES (?, ?)',
        (data.get('name', ''), data.get('tune_type', 'mixed'))
    )
    set_id = cur.lastrowid
    for i, tune_id in enumerate(data.get('tune_ids', [])):
        conn.execute('INSERT OR IGNORE INTO set_tunes (set_id, tune_id, position) VALUES (?,?,?)',
                     (set_id, tune_id, i))
    conn.commit()
    row = conn.execute('SELECT * FROM sets WHERE id=?', (set_id,)).fetchone()
    return jsonify(row_to_set(row, conn)), 201


@app.route('/api/sets/<int:set_id>', methods=['PUT'])
def update_set(set_id):
    data = request.json
    conn = get_db()
    conn.execute(
        'UPDATE sets SET name=?, tune_type=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
        (data.get('name', ''), data.get('tune_type', 'mixed'), set_id)
    )
    if 'tune_ids' in data:
        conn.execute('DELETE FROM set_tunes WHERE set_id=?', (set_id,))
        for i, tune_id in enumerate(data['tune_ids']):
            conn.execute('INSERT OR IGNORE INTO set_tunes (set_id, tune_id, position) VALUES (?,?,?)',
                         (set_id, tune_id, i))
    conn.commit()
    row = conn.execute('SELECT * FROM sets WHERE id=?', (set_id,)).fetchone()
    return jsonify(row_to_set(row, conn))


@app.route('/api/sets/<int:set_id>', methods=['DELETE'])
def delete_set(set_id):
    conn = get_db()
    conn.execute('DELETE FROM sets WHERE id=?', (set_id,))
    conn.commit()
    return '', 204

@app.route('/api/curated/search')
def search_curated():
    """Search the local curated tune library (TheSession canonical settings, ranked by tunebooks)."""
    q = request.args.get('q', '').strip()
    tune_type = request.args.get('type', '').strip()
    if len(q) < 2:
        return jsonify([])
    conn = get_db()
    params = [f'%{q}%']
    query = 'SELECT tune_id, name, type, mode, tunebooks, setting_id, abc FROM curated_tunes WHERE name LIKE ? COLLATE NOCASE'
    if tune_type:
        query += ' AND type = ?'
        params.append(tune_type.replace('_', ' '))
    query += ' ORDER BY tunebooks DESC LIMIT 30'
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/curated/<int:tune_id>')
def get_curated_tune(tune_id):
    """Get a specific curated tune's full details including ABC."""
    conn = get_db()
    row = conn.execute('SELECT * FROM curated_tunes WHERE tune_id = ?', (tune_id,)).fetchone()
    conn.close()
    if not row:
        return jsonify({'error': 'Not found'}), 404
    d = dict(row)
    # Parse mode into key + mode parts (e.g. "Dmajor" → key=D, mode=major)
    mode_str = d.get('mode', '')
    return jsonify(d)

@app.route('/api/search')
def search_thesession():
    q = request.args.get('q', '').strip()
    if len(q) < 2:
        return jsonify([])
    try:
        resp = http_req.get(
            'https://thesession.org/tunes/search',
            params={'q': q, 'format': 'json'},
            headers={'User-Agent': 'trad-session-app/1.0'},
            timeout=6,
        )
        resp.raise_for_status()
        items = resp.json().get('tunes', [])

        # Enrich results with tunebooks count (parallel fetch, best-effort)
        def fetch_tunebooks(item):
            try:
                r = http_req.get(
                    f"https://thesession.org/tunes/{item['id']}",
                    params={'format': 'json'},
                    headers={'User-Agent': 'trad-session-app/1.0'},
                    timeout=4,
                )
                if r.ok:
                    d = r.json()
                    return item['id'], d.get('tunebooks', 0), len(d.get('settings', []))
            except Exception:
                pass
            return item['id'], 0, 0

        enriched = {i['id']: {'tunebooks': 0, 'settings_count': 0} for i in items}
        with ThreadPoolExecutor(max_workers=6) as ex:
            futures = {ex.submit(fetch_tunebooks, i): i for i in items}
            for fut in as_completed(futures):
                tid, tb, sc = fut.result()
                enriched[tid] = {'tunebooks': tb, 'settings_count': sc}

        for item in items:
            item['tunebooks'] = enriched[item['id']]['tunebooks']
            item['settings_count'] = enriched[item['id']]['settings_count']

        # Sort by tunebooks descending so most popular tunes surface first
        items.sort(key=lambda x: x.get('tunebooks', 0), reverse=True)
        return jsonify(items)
    except Exception as exc:
        return jsonify({'error': str(exc)}), 502


@app.route('/api/thesession/<int:tune_id>')
def get_thesession_tune(tune_id):
    try:
        resp = http_req.get(
            f'https://thesession.org/tunes/{tune_id}',
            params={'format': 'json'},
            headers={'User-Agent': 'trad-session-app/1.0'},
            timeout=6,
        )
        resp.raise_for_status()
        data = resp.json()
        settings = data.get('settings', [])
        # Return all settings so frontend can offer a picker
        cleaned_settings = []
        for s in settings:
            abc = clean_abc(s.get('abc', '').replace('\r\n', '\n'))
            if abc:
                cleaned_settings.append({
                    'id': s.get('id'),
                    'key': s.get('key', ''),
                    'abc': abc,
                    'date': s.get('date', ''),
                    'member': s.get('member', {}).get('name', 'unknown'),
                })
        first = cleaned_settings[0] if cleaned_settings else {}
        return jsonify({
            'id': data.get('id'),
            'name': data.get('name'),
            'type': data.get('type'),
            'tunebooks': data.get('tunebooks', 0),
            'mode': first.get('key', ''),
            'abc': first.get('abc', ''),
            'settings': cleaned_settings,
            'settings_count': len(cleaned_settings),
        })
    except Exception as exc:
        return jsonify({'error': str(exc)}), 502



# ── Pairing (tune matching) ──────────────────────────────────────────────────

import random as _random

_PAIR_WORDS = ['reel', 'jig', 'polka', 'slip', 'horn', 'waltz', 'tune', 'fret', 'reed', 'bow']

def _gen_pair_code():
    word = _random.choice(_PAIR_WORDS).upper()
    num = _random.randint(1000, 9999)
    return f"{word}-{num}"

def _get_or_create_player():
    token = request.cookies.get('player_token')
    conn = get_db()
    player = None
    if token:
        player = conn.execute("SELECT * FROM players WHERE cookie_token=?", (token,)).fetchone()
    if player:
        conn.close()
        return dict(player), token, False
    new_token = secrets.token_urlsafe(24)
    conn.execute("INSERT INTO players (cookie_token) VALUES (?)", (new_token,))
    conn.commit()
    player = conn.execute("SELECT * FROM players WHERE cookie_token=?", (new_token,)).fetchone()
    conn.close()
    return dict(player), new_token, True

def _pair_response(data, token=None, is_new=False):
    resp = jsonify(data)
    if token and is_new:
        resp.set_cookie('player_token', token, max_age=365*24*3600, httponly=True, samesite='Lax')
    return resp


@app.route('/api/pair/me', methods=['GET'])
def pair_me():
    player, token, is_new = _get_or_create_player()
    return _pair_response({'player': player}, token, is_new)

@app.route('/api/pair/me', methods=['POST'])
def pair_update_me():
    player, token, is_new = _get_or_create_player()
    data = request.get_json() or {}
    name = (data.get('display_name') or '').strip()
    if name:
        conn = get_db()
        conn.execute("UPDATE players SET display_name=? WHERE id=?", (name, player['id']))
        conn.commit()
        player = dict(conn.execute("SELECT * FROM players WHERE id=?", (player['id'],)).fetchone())
        conn.close()
    return _pair_response({'player': player}, token, is_new)


@app.route('/api/pair/invites', methods=['GET'])
def pair_list_invites():
    player, token, is_new = _get_or_create_player()
    conn = get_db()
    invites = conn.execute(
        "SELECT * FROM pair_invites WHERE player_id=? ORDER BY created_at DESC",
        (player['id'],)
    ).fetchall()
    result = []
    for inv in invites:
        inv_dict = dict(inv)
        voters = conn.execute(
            """SELECT DISTINCT p.display_name, p.id as voter_id
               FROM pair_votes v JOIN players p ON p.id=v.voter_id
               WHERE v.invite_id=?""",
            (inv['id'],)
        ).fetchall()
        inv_dict['voters'] = [dict(v) for v in voters]
        yes_count = conn.execute(
            "SELECT COUNT(DISTINCT tune_id) FROM pair_votes WHERE invite_id=? AND vote=1",
            (inv['id'],)
        ).fetchone()[0]
        inv_dict['yes_count'] = yes_count
        result.append(inv_dict)
    conn.close()
    return _pair_response(result, token, is_new)


@app.route('/api/pair/invites', methods=['POST'])
def pair_create_invite():
    player, token, is_new = _get_or_create_player()
    data = request.get_json() or {}
    prompt = (data.get('prompt') or '').strip() or None
    statuses = data.get('statuses', 'know_it,performance_ready')
    conn = get_db()
    for _ in range(10):
        code = _gen_pair_code()
        try:
            conn.execute(
                "INSERT INTO pair_invites (code, player_id, prompt, statuses) VALUES (?,?,?,?)",
                (code, player['id'], prompt, statuses)
            )
            conn.commit()
            break
        except Exception:
            continue
    else:
        conn.close()
        return jsonify({'error': 'Could not generate unique code'}), 500
    invite = conn.execute("SELECT * FROM pair_invites WHERE code=?", (code,)).fetchone()
    conn.close()
    return _pair_response(dict(invite), token, is_new), 201


@app.route('/api/pair/<code>', methods=['GET'])
def pair_get_invite(code):
    player, token, is_new = _get_or_create_player()
    conn = get_db()
    invite = conn.execute("SELECT * FROM pair_invites WHERE code=?", (code,)).fetchone()
    if not invite:
        conn.close()
        abort(404)
    inv = dict(invite)
    owner = conn.execute("SELECT id, display_name FROM players WHERE id=?", (invite['player_id'],)).fetchone()
    inv['owner'] = dict(owner) if owner else None
    statuses = invite['statuses'].split(',')
    placeholders = ','.join('?' * len(statuses))
    tunes = conn.execute(
        f"SELECT id, title, tune_type, tune_key, mode, abc_notation FROM tunes WHERE status IN ({placeholders}) ORDER BY title",
        statuses
    ).fetchall()
    inv['tunes'] = [dict(t) for t in tunes]
    inv['tune_count'] = len(tunes)
    already_voted = conn.execute(
        "SELECT tune_id, vote FROM pair_votes WHERE invite_id=? AND voter_id=?",
        (invite['id'], player['id'])
    ).fetchall()
    inv['my_votes'] = {v['tune_id']: v['vote'] for v in already_voted}
    inv['is_owner'] = (player['id'] == invite['player_id'])
    conn.close()
    return _pair_response(inv, token, is_new)


@app.route('/api/pair/<code>/vote', methods=['POST'])
def pair_vote(code):
    player, token, is_new = _get_or_create_player()
    data = request.get_json() or {}
    tune_id = data.get('tune_id')
    vote = data.get('vote')
    if tune_id is None or vote is None:
        abort(400)
    conn = get_db()
    invite = conn.execute("SELECT * FROM pair_invites WHERE code=? AND status='open'", (code,)).fetchone()
    if not invite:
        conn.close()
        abort(404)
    conn.execute(
        "INSERT OR REPLACE INTO pair_votes (invite_id, voter_id, tune_id, vote) VALUES (?,?,?,?)",
        (invite['id'], player['id'], tune_id, int(bool(vote)))
    )
    conn.commit()
    conn.close()
    return _pair_response({'ok': True}, token, is_new)


@app.route('/api/pair/<code>/results', methods=['GET'])
def pair_results(code):
    player, token, is_new = _get_or_create_player()
    conn = get_db()
    invite = conn.execute("SELECT * FROM pair_invites WHERE code=?", (code,)).fetchone()
    if not invite:
        conn.close()
        abort(404)
    voters = conn.execute(
        """SELECT DISTINCT p.id, p.display_name
           FROM pair_votes v JOIN players p ON p.id=v.voter_id
           WHERE v.invite_id=?""",
        (invite['id'],)
    ).fetchall()
    statuses = invite['statuses'].split(',')
    placeholders = ','.join('?' * len(statuses))
    all_tunes = conn.execute(
        f"SELECT id, title, tune_type, tune_key, mode FROM tunes WHERE status IN ({placeholders}) ORDER BY title",
        statuses
    ).fetchall()
    votes = conn.execute(
        "SELECT voter_id, tune_id, vote FROM pair_votes WHERE invite_id=?",
        (invite['id'],)
    ).fetchall()
    vote_map = {}
    for v in votes:
        vote_map.setdefault(v['tune_id'], {})[v['voter_id']] = v['vote']
    matched = []
    for t in all_tunes:
        tv = vote_map.get(t['id'], {})
        if all(tv.get(v['id'], 0) == 1 for v in voters) and len(tv) == len(voters) and len(voters) > 0:
            matched.append(dict(t))
    owner = conn.execute("SELECT id, display_name FROM players WHERE id=?", (invite['player_id'],)).fetchone()
    conn.close()
    return _pair_response({
        'invite': dict(invite),
        'owner': dict(owner) if owner else None,
        'voters': [dict(v) for v in voters],
        'matched_tunes': matched,
        'total_tunes': len(all_tunes),
    }, token, is_new)


@app.route('/api/pair/<code>', methods=['DELETE'])
def pair_delete_invite(code):
    player, token, is_new = _get_or_create_player()
    conn = get_db()
    invite = conn.execute("SELECT * FROM pair_invites WHERE code=? AND player_id=?", (code, player['id'])).fetchone()
    if not invite:
        conn.close()
        abort(404)
    conn.execute("DELETE FROM pair_votes WHERE invite_id=?", (invite['id'],))
    conn.execute("DELETE FROM pair_invites WHERE id=?", (invite['id'],))
    conn.commit()
    conn.close()
    return _pair_response({'ok': True}, token, is_new), 204



# Friends API

def _friend_row(row, conn):
    f = dict(row)
    f['tune_count'] = conn.execute(
        'SELECT COUNT(*) FROM tune_friends WHERE friend_id=?', (f['id'],)
    ).fetchone()[0]
    return f


@app.route('/api/friends', methods=['GET'])
def list_friends():
    conn = get_db()
    rows = conn.execute('SELECT * FROM friends ORDER BY name').fetchall()
    result = [_friend_row(r, conn) for r in rows]
    conn.close()
    return jsonify(result)


@app.route('/api/friends', methods=['POST'])
def create_friend():
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        abort(400)
    conn = get_db()
    cur = conn.execute(
        'INSERT INTO friends (name, type, color, notes) VALUES (?,?,?,?)',
        (name, data.get('type', 'person'), data.get('color', 'green'), data.get('notes'))
    )
    conn.commit()
    row = conn.execute('SELECT * FROM friends WHERE id=?', (cur.lastrowid,)).fetchone()
    result = _friend_row(row, conn)
    conn.close()
    return jsonify(result), 201


@app.route('/api/friends/<int:friend_id>', methods=['GET'])
def get_friend(friend_id):
    conn = get_db()
    row = conn.execute('SELECT * FROM friends WHERE id=?', (friend_id,)).fetchone()
    if not row:
        conn.close(); abort(404)
    f = _friend_row(row, conn)
    tunes = conn.execute(
        'SELECT t.*, tf.added_via FROM tunes t'
        ' JOIN tune_friends tf ON tf.tune_id=t.id'
        ' WHERE tf.friend_id=? ORDER BY t.title',
        (friend_id,)
    ).fetchall()
    f['tunes'] = [dict(t) for t in tunes]
    conn.close()
    return jsonify(f)


@app.route('/api/friends/<int:friend_id>', methods=['PUT'])
def update_friend(friend_id):
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        abort(400)
    conn = get_db()
    row = conn.execute('SELECT id FROM friends WHERE id=?', (friend_id,)).fetchone()
    if not row:
        conn.close(); abort(404)
    conn.execute(
        'UPDATE friends SET name=?, type=?, color=?, notes=? WHERE id=?',
        (name, data.get('type', 'person'), data.get('color', 'green'), data.get('notes'), friend_id)
    )
    conn.commit()
    row = conn.execute('SELECT * FROM friends WHERE id=?', (friend_id,)).fetchone()
    result = _friend_row(row, conn)
    conn.close()
    return jsonify(result)


@app.route('/api/friends/<int:friend_id>', methods=['DELETE'])
def delete_friend(friend_id):
    conn = get_db()
    conn.execute('DELETE FROM tune_friends WHERE friend_id=?', (friend_id,))
    conn.execute('DELETE FROM friends WHERE id=?', (friend_id,))
    conn.commit()
    conn.close()
    return '', 204


@app.route('/api/friends/<int:friend_id>/tunes', methods=['POST'])
def add_tunes_to_friend(friend_id):
    data = request.get_json() or {}
    tune_ids = data.get('tune_ids', [])
    if isinstance(tune_ids, int):
        tune_ids = [tune_ids]
    added_via = data.get('added_via', 'manual')
    conn = get_db()
    for tid in tune_ids:
        conn.execute(
            'INSERT OR IGNORE INTO tune_friends (tune_id, friend_id, added_via) VALUES (?,?,?)',
            (tid, friend_id, added_via)
        )
    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'added': len(tune_ids)})


@app.route('/api/friends/<int:friend_id>/tunes/<int:tune_id>', methods=['DELETE'])
def remove_tune_from_friend(friend_id, tune_id):
    conn = get_db()
    conn.execute('DELETE FROM tune_friends WHERE friend_id=? AND tune_id=?', (friend_id, tune_id))
    conn.commit()
    conn.close()
    return '', 204


@app.route('/api/tunes/<int:tune_id>/friends', methods=['GET'])
def get_tune_friends(tune_id):
    conn = get_db()
    rows = conn.execute(
        'SELECT f.*, tf.added_via FROM friends f'
        ' JOIN tune_friends tf ON tf.friend_id=f.id'
        ' WHERE tf.tune_id=? ORDER BY f.name',
        (tune_id,)
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/tunes/<int:tune_id>/friends', methods=['POST'])
def add_friend_to_tune(tune_id):
    data = request.get_json() or {}
    friend_id = data.get('friend_id')
    if not friend_id:
        abort(400)
    conn = get_db()
    conn.execute(
        'INSERT OR IGNORE INTO tune_friends (tune_id, friend_id, added_via) VALUES (?,?,?)',
        (tune_id, friend_id, data.get('added_via', 'manual'))
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/tunes/<int:tune_id>/friends/<int:friend_id>', methods=['DELETE'])
def remove_friend_from_tune(tune_id, friend_id):
    conn = get_db()
    conn.execute('DELETE FROM tune_friends WHERE tune_id=? AND friend_id=?', (tune_id, friend_id))
    conn.commit()
    conn.close()
    return '', 204


ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY', '')

@app.route('/api/tune-research')
def tune_research():
    q = request.args.get('q', '').strip()
    if not q:
        return jsonify({'error': 'q required'}), 400

    key = _normalize_title(q)
    conn = get_db()

    cached = conn.execute(
        'SELECT result_json FROM tune_research_cache WHERE tune_name=?', (key,)
    ).fetchone()
    if cached:
        conn.close()
        result = json.loads(cached['result_json'])
        result['cached'] = True
        return jsonify(result)

    if not ANTHROPIC_API_KEY:
        conn.close()
        return jsonify({'error': 'AI research not configured — set ANTHROPIC_API_KEY'}), 503

    prompt = (
        f'You are an Irish traditional music expert. Research the tune "{q}".\n\n'
        'Return ONLY a valid JSON object (no markdown, no explanation) with these fields:\n'
        '- "composer": who composed it, or "Traditional" if anonymous/unknown\n'
        '- "origin": geographical and historical origin (region, country, era)\n'
        '- "copyright": "Public domain", "Unknown", or copyright holder if known\n'
        '- "notes": 1-2 sentences of interesting background, concise\n'
        '- "notable_players": array of 3-5 musician or band names associated with this tune\n\n'
        'If uncertain about any field, say so briefly rather than inventing details.'
    )

    try:
        resp = http_req.post(
            'https://api.anthropic.com/v1/messages',
            headers={
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
            },
            json={
                'model': 'claude-haiku-4-5-20251001',
                'max_tokens': 400,
                'messages': [{'role': 'user', 'content': prompt}],
            },
            timeout=15,
        )
        resp.raise_for_status()
        text = resp.json()['content'][0]['text'].strip()
        # Strip markdown fences if model wrapped anyway
        if text.startswith('```'):
            text = text.split('\n', 1)[1].rsplit('```', 1)[0].strip()
        result = json.loads(text)
        result['cached'] = False
        conn.execute(
            'INSERT OR REPLACE INTO tune_research_cache (tune_name, result_json) VALUES (?, ?)',
            (key, json.dumps({k: v for k, v in result.items() if k != 'cached'}))
        )
        conn.commit()
        conn.close()
        return jsonify(result)
    except json.JSONDecodeError:
        conn.close()
        return jsonify({'error': 'AI returned unparseable response'}), 502
    except Exception as exc:
        conn.close()
        return jsonify({'error': str(exc)}), 502


@app.route('/api/thesession/<int:tune_id>/recordings')
def get_thesession_recordings(tune_id):
    try:
        resp = http_req.get(
            f'https://thesession.org/tunes/{tune_id}/recordings',
            params={'format': 'json'},
            headers={'User-Agent': 'trad-session-app/1.0'},
            timeout=6,
        )
        resp.raise_for_status()
        recordings = resp.json().get('recordings', [])
        return jsonify([{
            'id':     r.get('id'),
            'name':   r.get('name'),
            'artist': r.get('member', {}).get('name', ''),
            'url':    f"https://thesession.org/recordings/{r.get('id')}",
        } for r in recordings[:8]])
    except Exception:
        return jsonify([])


@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_spa(path):
    if path and os.path.exists(os.path.join(STATIC_DIR, path)):
        return send_from_directory(STATIC_DIR, path)
    return send_from_directory(STATIC_DIR, 'index.html')


if __name__ == '__main__':
    init_db()
    port = int(os.environ.get('PORT', 18010))
    cert = os.environ.get('SSL_CERT')
    key  = os.environ.get('SSL_KEY')
    if cert and key and os.path.exists(cert) and os.path.exists(key):
        app.run(host='0.0.0.0', port=port, ssl_context=(cert, key))
    else:
        app.run(host='0.0.0.0', port=port)
