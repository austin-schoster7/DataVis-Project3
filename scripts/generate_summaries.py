#!/usr/bin/env python3
import csv, json, re
from collections import defaultdict

# ——— File paths ———
INPUT_CSV      = 'data/regular_show_transcripts.csv'
CHAR_SUM_OUT   = 'data/character_summary.json'
SEASON_SUM_OUT = 'data/season_summary.json'
EP_SUM_OUT     = 'data/episode_summary.json'

# Roles to drop completely
DROP_CHARS = {
    'REGULAR SHOW', 'EVERYONE', 'MAN', 'WOMAN', 'ANNOUNCER',
}

def normalize(name: str) -> str:
    name = name.upper().strip()
    # strip any trailing parenthetical: "RIGBY (CONTINUED)" → "RIGBY"
    name = re.sub(r'\s*\(.*?\)\s*$', '', name)
    # drop any “combo” names containing AND or &
    if re.search(r'\b(?:AND|&)\b', name):
        return ''
    return name

# ——— Accumulators ———
show_stats     = defaultdict(lambda: {'episodes': set(), 'total_lines': 0, 'total_words': 0})
season_stats   = defaultdict(lambda: defaultdict(lambda: {'episodes': set(), 'lines': 0, 'words': 0}))
episode_stats  = defaultdict(lambda: {'lines': 0, 'words': 0})

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

        # show‑wide totals
        s = show_stats[char]
        s['episodes'].add((season, episode))
        s['total_lines'] += 1
        s['total_words'] += words

        # per‑season totals
        ps = season_stats[season][char]
        ps['episodes'].add(episode)
        ps['lines'] += 1
        ps['words'] += words

        # per‑episode totals
        key = (season, episode, char)
        ep = episode_stats[key]
        ep['lines'] += 1
        ep['words'] += words

# ——— character_summary.json ———
char_summary = []
for character, stats in show_stats.items():
    num_eps = len(stats['episodes'])
    if num_eps > 1:
        char_summary.append({
            'character': character,
            'totalEpisodes': num_eps,
            'totalLines': stats['total_lines'],
            'totalWords': stats['total_words']
        })
char_summary.sort(key=lambda x: x['totalEpisodes'], reverse=True)
with open(CHAR_SUM_OUT, 'w', encoding='utf-8') as f:
    json.dump(char_summary, f, indent=2)
print(f"Wrote {CHAR_SUM_OUT}")

# ——— season_summary.json ———
season_summary = []
for season, chars in sorted(season_stats.items()):
    for character, stats in chars.items():
        if character in DROP_CHARS:
            continue
        season_summary.append({
            'season': season,
            'character': character,
            'episodes': sorted(stats['episodes']),
            'lines': stats['lines'],
            'words': stats['words']
        })
with open(SEASON_SUM_OUT, 'w', encoding='utf-8') as f:
    json.dump(season_summary, f, indent=2)
print(f"Wrote {SEASON_SUM_OUT}")

# ——— episode_summary.json ———
ep_list = []
for (season, episode, character), stats in episode_stats.items():
    if character in DROP_CHARS:
        continue
    ep_list.append({
        'season': season,
        'episode': episode,
        'character': character,
        'lines': stats['lines'],
        'words': stats['words']
    })
ep_list.sort(key=lambda x: (x['season'], x['episode'], x['character']))
with open(EP_SUM_OUT, 'w', encoding='utf-8') as f:
    json.dump(ep_list, f, indent=2)
print(f"Wrote {EP_SUM_OUT}")