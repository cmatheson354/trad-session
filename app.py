import os
import sqlite3
import secrets
import uuid
import requests as http_req
from datetime import datetime
from flask import Flask, jsonify, request, send_from_directory, send_file, abort
from flask_cors import CORS

app = Flask(__name__, static_folder='static', static_url_path='')
CORS(app)

DATA_DIR = os.environ.get('DATA_DIR', 'data')
DB_PATH = os.path.join(DATA_DIR, 'tunes.db')
RECORDINGS_DIR = os.path.join(DATA_DIR, 'recordings')
ALLOWED_AUDIO_EXTS = {'.webm', '.ogg', '.mp3', '.mp4', '.m4a', '.wav', '.aac', '.flac'}


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    return conn


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
    conn.commit()
    conn.close()



@app.route('/api/share/token', methods=['GET'])
def get_share_token():
    conn = get_db()
    row = conn.execute("SELECT value FROM settings WHERE key='share_token'").fetchone()
    conn.close()
    return jsonify({'token': row['value'] if row else None})

@app.route('/api/share/token', methods=['POST'])
def create_share_token():
    data = request.get_json() or {}
    action = data.get('action', 'generate')
    conn = get_db()
    if action == 'revoke':
        conn.execute("DELETE FROM settings WHERE key='share_token'")
        conn.commit()
        conn.close()
        return jsonify({'token': None})
    # Save config alongside token
    token = secrets.token_urlsafe(16)
    conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('share_token', ?)", (token,))
    conn.commit()
    conn.close()
    return jsonify({'token': token})

@app.route('/api/share/config', methods=['GET', 'POST'])
def share_config():
    conn = get_db()
    if request.method == 'POST':
        data = request.get_json() or {}
        for key in ['share_statuses', 'share_label']:
            if key in data:
                conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
                             (key, data[key]))
        conn.commit()
        conn.close()
        return jsonify({'ok': True})
    rows = conn.execute("SELECT key, value FROM settings WHERE key IN ('share_statuses','share_label','share_token')").fetchall()
    conn.close()
    cfg = {r['key']: r['value'] for r in rows}
    return jsonify(cfg)

@app.route('/share/<token>')
def shared_list(token):
    conn = get_db()
    row = conn.execute("SELECT value FROM settings WHERE key='share_token'").fetchone()
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

@app.route('/health')
def health():
    return jsonify({'status': 'ok'})


@app.route('/api/stats')
def stats():
    conn = get_db()
    by_status = conn.execute('SELECT status, COUNT(*) as count FROM tunes GROUP BY status').fetchall()
    by_type = conn.execute('SELECT tune_type, COUNT(*) as count FROM tunes GROUP BY tune_type').fetchall()
    total = conn.execute('SELECT COUNT(*) as count FROM tunes').fetchone()
    conn.close()
    return jsonify({
        'total': total['count'],
        'by_status': {r['status']: r['count'] for r in by_status},
        'by_type': {r['tune_type']: r['count'] for r in by_type},
    })


@app.route('/api/tunes', methods=['GET'])
def list_tunes():
    status = request.args.get('status')
    tune_type = request.args.get('type')
    key = request.args.get('key')
    search = request.args.get('q')
    query = 'SELECT * FROM tunes WHERE 1=1'
    params = []
    if status:
        query += ' AND status = ?'
        params.append(status)
    if tune_type:
        query += ' AND tune_type = ?'
        params.append(tune_type)
    if key:
        query += ' AND tune_key = ?'
        params.append(key)
    if search:
        query += ' AND title LIKE ?'
        params.append(f'%{search}%')
    query += ' ORDER BY title ASC'
    conn = get_db()
    tunes = conn.execute(query, params).fetchall()
    conn.close()
    return jsonify([dict(t) for t in tunes])


@app.route('/api/tunes', methods=['POST'])
def create_tune():
    data = request.get_json()
    if not data or not data.get('title'):
        abort(400)
    conn = get_db()
    cur = conn.execute(
        'INSERT INTO tunes (title, tune_type, tune_key, mode, abc_notation, thesession_id, status, notes, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        (data['title'], data.get('tune_type', 'reel'), data.get('tune_key'),
         data.get('mode'), clean_abc(data.get('abc_notation')), data.get('thesession_id'),
         data.get('status', 'want_to_learn'), data.get('notes'), data.get('source'))
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
        first = settings[0] if settings else {}
        abc = clean_abc(first.get('abc', '').replace('\r\n', '\n'))
        return jsonify({
            'id': data.get('id'),
            'name': data.get('name'),
            'type': data.get('type'),
            'mode': first.get('key', ''),
            'abc': abc,
            'settings_count': len(settings),
        })
    except Exception as exc:
        return jsonify({'error': str(exc)}), 502


@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_spa(path):
    if path and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, 'index.html')


if __name__ == '__main__':
    init_db()
    port = int(os.environ.get('PORT', 18010))
    cert = os.environ.get('SSL_CERT')
    key  = os.environ.get('SSL_KEY')
    if cert and key and os.path.exists(cert) and os.path.exists(key):
        app.run(host='0.0.0.0', port=port, ssl_context=(cert, key))
    else:
        app.run(host='0.0.0.0', port=port)
