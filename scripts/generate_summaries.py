#!/usr/bin/env python3
import csv
import json
import re
from collections import defaultdict

# ——— File paths ———
INPUT_CSV      = 'data/regular_show_transcripts.csv'
CHAR_SUM_OUT   = 'data/character_summary.json'
SEASON_SUM_OUT = 'data/season_summary.json'
EP_SUM_OUT     = 'data/episode_summary.json'

# Roles to drop entirely
DROP_CHARS = {
    'REGULAR SHOW', 'EVERYONE', 'MAN', 'WOMAN', 'ANNOUNCER',
}

def normalize(name: str) -> str:
    """
    Uppercase, strip parentheticals, unify hyphens, canonicalize
    HI‐FIVE/HIGH FIVE GHOST variants, and drop combos.
    """
    nm = name.upper().strip()

    # 1) strip trailing parenthetical: "RIGBY (CONTINUED)" → "RIGBY"
    nm = re.sub(r'\s*\(.*?\)\s*$', '', nm)

    # 2) replace hyphens or em-dashes with spaces, collapse multiple spaces
    nm = re.sub(r'[-—]', ' ', nm)
    nm = re.sub(r'\s+', ' ', nm).strip()

    # 3) canonicalize High Five Ghost variants
    if re.fullmatch(r'(HI|HIGH)\s+FIVE\s+GHOST', nm):
        return 'HIGH FIVE GHOST'

    # 4) drop any combos: commas, &, or the word AND
    if ',' in nm or '&' in nm or ' AND ' in nm:
        return ''

    return nm

# ——— Accumulators ———
# show_stats[char] = {'episodes': set((s,e)), 'total_lines': int, 'total_words': int}
show_stats    = defaultdict(lambda: {'episodes': set(), 'total_lines': 0, 'total_words': 0})
# season_stats[s][char] = {'episodes': set(e), 'lines': int, 'words': int}
season_stats  = defaultdict(lambda: defaultdict(lambda: {'episodes': set(), 'lines': 0, 'words': 0}))
# episode_stats[(s,e,char)] = {'lines': int, 'words': int}
episode_stats = defaultdict(lambda: {'lines': 0, 'words': 0})

# ——— Read CSV and populate stats ———
with open(INPUT_CSV, newline='', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        season  = int(row['season'])
        episode = int(row['episode'])
        raw     = row['speaker']
        char    = normalize(raw)
        if not char or char in DROP_CHARS:
            continue

        words = len(row['text'].split())

        # show-wide
        ss = show_stats[char]
        ss['episodes'].add((season, episode))
        ss['total_lines'] += 1
        ss['total_words'] += words

        # per-season
        cs = season_stats[season][char]
        cs['episodes'].add(episode)
        cs['lines'] += 1
        cs['words'] += words

        # per-episode
        key = (season, episode, char)
        ep  = episode_stats[key]
        ep['lines'] += 1
        ep['words'] += words

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

# ─── Write season_summary.json ───
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

# ─── Write episode_summary.json ───
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
