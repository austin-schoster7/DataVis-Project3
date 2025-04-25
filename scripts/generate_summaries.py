#!/usr/bin/env python3
import csv
import json
import re
from collections import defaultdict, Counter
from itertools import combinations

# ——— File paths ———
INPUT_CSV      = 'data/regular_show_transcripts.csv'
CHAR_SUM_OUT   = 'data/character_summary.json'
SEASON_SUM_OUT = 'data/season_summary.json'
EP_SUM_OUT     = 'data/episode_summary.json'
COOCC_OUT      = 'data/cooccurrence.json'
TIMING_OUT     = 'data/timing.json'

# Roles to drop completely
DROP_CHARS = {
    'REGULAR SHOW', 'EVERYONE', 'MAN', 'WOMAN', 'ANNOUNCER',
}

def normalize(name: str) -> str:
    """
    Uppercase, strip parentheticals, collapse hyphens, canonicalize
    HI-FIVE GHOST variants, and drop combos.
    """
    nm = name.upper().strip()
    # strip trailing parenthetical
    nm = re.sub(r'\s*\(.*?\)\s*$', '', nm)
    # replace hyphens/em-dashes with spaces, collapse spaces
    nm = re.sub(r'[-—]', ' ', nm)
    nm = re.sub(r'\s+', ' ', nm).strip()
    # canonicalize High Five Ghost
    if re.fullmatch(r'(HI|HIGH)\s+FIVE\s+GHOST', nm):
        return 'HIGH FIVE GHOST'
    # drop combos: commas, &, or the word AND
    if ',' in nm or '&' in nm or ' AND ' in nm:
        return ''
    return nm

# ——— Accumulators ———
show_stats      = defaultdict(lambda: {'episodes': set(), 'total_lines': 0, 'total_words': 0})
season_stats    = defaultdict(lambda: defaultdict(lambda: {'episodes': set(), 'lines': 0, 'words': 0}))
episode_stats   = defaultdict(lambda: {'lines': 0, 'words': 0})
scene_chars     = defaultdict(set)
episode_line_count = Counter()
line_positions  = defaultdict(list)

# ——— Read all rows once ———
rows = []
with open(INPUT_CSV, newline='', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        rows.append(row)

# ——— First pass: gather counts, scene membership, line counts ———
for row in rows:
    season  = int(row['season'])
    episode = int(row['episode'])
    scene   = row.get('scene') or ''
    raw     = row['speaker']
    char    = normalize(raw)
    if not char or char in DROP_CHARS:
        continue

    text = row.get('text','').strip()
    words = len(text.split())

    # show-wide stats
    ss = show_stats[char]
    ss['episodes'].add((season, episode))
    ss['total_lines'] += 1
    ss['total_words'] += words

    # per-season stats
    cs = season_stats[season][char]
    cs['episodes'].add(episode)
    cs['lines'] += 1
    cs['words'] += words

    # per-episode stats
    key_ep = (season, episode, char)
    eps = episode_stats[key_ep]
    eps['lines'] += 1
    eps['words'] += words

    # scene co-occurrence
    key_sc = (season, episode, scene)
    scene_chars[key_sc].add(char)

    # line count for timing
    episode_line_count[(season, episode)] += 1

# ——— Second pass: record relative line positions ———
counters = Counter()
for row in rows:
    season  = int(row['season'])
    episode = int(row['episode'])
    raw     = row['speaker']
    char    = normalize(raw)
    if not char or char in DROP_CHARS:
        continue

    key_ep = (season, episode)
    counters[key_ep] += 1
    pos = counters[key_ep] / episode_line_count[key_ep]
    line_positions[(season, episode, char)].append(pos)

# ——— Write character_summary.json ———
char_summary = []
for character, stats in show_stats.items():
    num_eps = len(stats['episodes'])
    if num_eps <= 1:
        continue
    char_summary.append({
        'character':     character,
        'totalEpisodes': num_eps,
        'totalLines':    stats['total_lines'],
        'totalWords':    stats['total_words']
    })
char_summary.sort(key=lambda d: d['totalEpisodes'], reverse=True)

with open(CHAR_SUM_OUT, 'w', encoding='utf-8') as f:
    json.dump(char_summary, f, indent=2)
print(f"Wrote {CHAR_SUM_OUT}")

# ——— Write season_summary.json ———
season_summary = []
for season, chars in sorted(season_stats.items()):
    for character, stats in chars.items():
        if character in DROP_CHARS:
            continue
        season_summary.append({
            'season':    season,
            'character': character,
            'episodes':  sorted(stats['episodes']),
            'lines':     stats['lines'],
            'words':     stats['words']
        })

with open(SEASON_SUM_OUT, 'w', encoding='utf-8') as f:
    json.dump(season_summary, f, indent=2)
print(f"Wrote {SEASON_SUM_OUT}")

# ——— Write episode_summary.json ———
episode_summary = []
for (s,e,c), stats in episode_stats.items():
    if c in DROP_CHARS:
        continue
    episode_summary.append({
        'season':    s,
        'episode':   e,
        'character': c,
        'lines':     stats['lines'],
        'words':     stats['words']
    })

with open(EP_SUM_OUT, 'w', encoding='utf-8') as f:
    json.dump(episode_summary, f, indent=2)
print(f"Wrote {EP_SUM_OUT}")

# ——— Write cooccurrence.json ———
co_counts = Counter()
for chars in scene_chars.values():
    for a,b in combinations(sorted(chars), 2):
        co_counts[(a,b)] += 1

nodes = [{'id': c} for c in show_stats if c not in DROP_CHARS]
links = [
    {'source': a, 'target': b, 'value': v}
    for (a,b), v in co_counts.items() if v >= 3
]

with open(COOCC_OUT, 'w', encoding='utf-8') as f:
    json.dump({'nodes': nodes, 'links': links}, f, indent=2)
print(f"Wrote {COOCC_OUT}")

# ——— Write timing.json ———
timing = []
for (s,e,c), poses in line_positions.items():
    if c in DROP_CHARS:
        continue
    timing.append({
        'season':    s,
        'episode':   e,
        'character': c,
        'positions': poses
    })

with open(TIMING_OUT, 'w', encoding='utf-8') as f:
    json.dump(timing, f, indent=2)
print(f"Wrote {TIMING_OUT}")
