"""
Scrape Regular Show transcripts from Fandom and save:
season, episode, speaker, text, scene, url
"""

import csv, re, time, requests
from bs4 import BeautifulSoup

# -------------------------------------------------------------- CONFIG
BASE_URL = "https://regularshow.fandom.com"
SEASON_CATEGORY_URLS = [
    f"{BASE_URL}/wiki/Category:Season_{name}_Transcripts"
    for name in ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight"]
]
HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) "
                   "Chrome/120.0.0.0 Safari/537.36")
}
DELAY = 1.2  # polite delay between requests

ORDINAL_MAP = {
    "first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5,
    "sixth": 6, "seventh": 7, "eighth": 8, "ninth": 9, "tenth": 10,
    "eleventh": 11, "twelfth": 12, "thirteenth": 13, "fourteenth": 14,
    "fifteenth": 15, "sixteenth": 16, "seventeenth": 17, "eighteenth": 18,
    "nineteenth": 19, "twentieth": 20, "twenty‑first": 21, "twenty‑second": 22,
    "twenty‑third": 23, "twenty‑fourth": 24, "twenty‑fifth": 25,
}

# --------------------------------------------------------- HELPERS
def category_links(season_num: int, url: str) -> list[str]:
    """Return every transcript URL in the season‑category page (order preserved)."""
    html = requests.get(url, headers=HEADERS).text
    soup = BeautifulSoup(html, "html.parser")

    links = []
    for a in soup.select("a.category-page__member-link"):
        href = a.get("href", "")
        if href.endswith("/Transcript"):
            links.append(BASE_URL + href)

    print(f"Season {season_num}: {len(links)} transcript pages")
    return links


def real_episode_number(transcript_url: str) -> int | None:
    ep_page = transcript_url.rsplit("/Transcript", 1)[0]
    try:
        html = requests.get(ep_page, headers=HEADERS, timeout=15).text
    except Exception:
        return None

    soup = BeautifulSoup(html, "html.parser")
    text = soup.get_text(" ", strip=True)

    # 1) Season X, Episode Y
    m = re.search(r"Season\s+(\d+),\s*Episode\s+(\d+)", text, re.I)
    if m:
        return int(m.group(2))

    # 2) Infobox label “Episode no.”
    for label in soup.select("h3.pi-data-label"):
        lbl = label.get_text(strip=True).lower()
        if lbl in ("episode", "episode no.", "episode number"):
            val = label.find_next_sibling("div.pi-data-value")
            if val:
                digits = re.findall(r"\d+", val.get_text())
                if digits:
                    return int(digits[0])

    # 3) Fallback plain “Episode No. 7”
    m = re.search(r"\bEpisode\s+No\.?\s*(\d+)\b", text, re.I)
    if m:
        return int(m.group(1))

    # 4) Ordinal wording (“the twenty-first episode in…”)
    m = re.search(r"\bthe\s+([a-z]+(?:-[a-z]+)*)\s+episode\b", text, re.I)
    if m:
        word = m.group(1).lower().replace("‐", "-")  # normalize hyphens
        return ORDINAL_MAP.get(word)

    return None


def parse_transcript(url: str, season: int, episode: int) -> list[dict]:
    """Return every dialogue line as a dict."""
    html = requests.get(url, headers=HEADERS).text
    soup = BeautifulSoup(html, "html.parser")

    current_scene = None
    rows = []

    root = soup.select_one("div.mw-parser-output") or soup
    for node in root.find_all(["p", "li"]):
        text = node.get_text(" ", strip=True)
        if not text:
            continue

        # Scene header
        if text.startswith("[") and text.endswith("]") and len(text) < 120:
            current_scene = text[1:-1]
            continue

        # Dialogue line: SPEAKER: words
        if ":" in text:
            speaker, line = text.split(":", 1)
            speaker = speaker.strip().upper()
            line = line.strip()
            if speaker and line and len(speaker) < 40:
                rows.append(
                    {
                        "season": season,
                        "episode": episode,
                        "speaker": speaker,
                        "text": line,
                        "scene": current_scene,
                        "url": url,
                    }
                )
    return rows

# ----------------------------------------------------------- MAIN
def main():
    with open("data/regular_show_transcripts.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["season", "episode", "speaker", "text", "scene", "url"])

        for season_num, cat_url in enumerate(SEASON_CATEGORY_URLS, start=1):
            links = category_links(season_num, cat_url)

            ep_counter = 1  # sequential fallback number
            for link in links:
                ep_num = real_episode_number(link) or ep_counter
                ep_counter += 1  # advance for next fallback

                print(f" S{season_num} E{ep_num:02}  {link}")
                try:
                    rows = parse_transcript(link, season_num, ep_num)
                    print(f"      ↳ {len(rows)} lines")
                    for r in rows:
                        writer.writerow(
                            [r["season"], r["episode"], r["speaker"],
                             r["text"], r["scene"], r["url"]]
                        )
                except Exception as e:
                    print(f"      ! error: {e}")

                time.sleep(DELAY)

    print("Done → regular_show_transcripts.csv")


if __name__ == "__main__":
    main()
