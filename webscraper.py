import time
import csv
import requests
from bs4 import BeautifulSoup

# -------------------------------------------------
# 1) Identify the base URL and the list (index) of transcript pages
# -------------------------------------------------
BASE_URL = "https://regularshow.fandom.com"
TRANSCRIPTS_INDEX_URL = "https://regularshow.fandom.com/wiki/Category:Transcripts"

# Optional: some sites block default user-agents
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/90.0.4430.72 Safari/537.36"
}

# -------------------------------------------------
# 2) Function to get the list of all transcript links from the index page
# -------------------------------------------------
def get_episode_links():
    """
    Scrape the main transcripts category page to get links
    to each episode's transcript.
    """
    episode_links = []
    # Fetch the index page
    response = requests.get(TRANSCRIPTS_INDEX_URL, headers=HEADERS)
    if response.status_code != 200:
        print(f"Failed to retrieve {TRANSCRIPTS_INDEX_URL}")
        return episode_links

    soup = BeautifulSoup(response.text, "html.parser")

    # Example: Suppose each transcript link is in a <div class="category-page__member"> <a> structure.
    # Adjust this CSS selector based on real HTML from the site you use.
    link_tags = soup.select('div.category-page__member a')

    # Collect all episode page URLs
    for link_tag in link_tags:
        href = link_tag.get("href")
        if href and "/wiki/" in href:
            # Build the absolute URL
            full_url = BASE_URL + href
            episode_links.append(full_url)
    
    return episode_links

# -------------------------------------------------
# 3) Function to parse a single episode page for lines of dialogue
# -------------------------------------------------
def parse_episode_transcript(url):
    """
    Given a URL of an episode's transcript page,
    parse and return a list of dialogue entries of the form:
    {
      'season': int or None,
      'episode': int or None,
      'speaker': str,
      'text': str,
      'scene': str or None
    }
    """
    # We'll store all lines here
    dialogue_data = []

    # Request the page
    response = requests.get(url, headers=HEADERS)
    if response.status_code != 200:
        print(f"Failed to retrieve {url}")
        return dialogue_data
    
    soup = BeautifulSoup(response.text, "html.parser")

    # Try to extract season/episode from the page title or from some known location
    # This often requires custom logic per site.
    # Example: <h1 class="page-header__title">S02E05: 'Really Real Wrestling'</h1>
    season, episode = None, None
    # Hypothetical example - adapt to match site structure:
    title_tag = soup.select_one('h1.page-header__title')
    if title_tag:
        title_text = title_tag.get_text(strip=True)
        # Example parse using simple pattern
        # If your transcripts have a known naming pattern like "Season X Episode Y"
        # or "S02E05," do something like:
        # You might need a more robust approach, e.g., regular expressions:
        import re
        match = re.search(r'S(\d+)E(\d+)', title_text)
        if match:
            season = int(match.group(1))
            episode = int(match.group(2))

    # Next, locate the lines of dialogue
    # Many wikis simply put lines in paragraphs or <li> elements, e.g.:
    # <p><b>MORDECAI:</b> "Dude, we have to try that!"</p>
    # Adjust the selector to match the actual structure.
    # Let's assume the lines are in <p> tags:
    paragraphs = soup.find_all('p')

    current_scene = None

    for p in paragraphs:
        # Check if this paragraph announces a new scene
        # Often it's something like: [Scene: The Park]
        text = p.get_text(strip=True)
        
        # Hypothetical detection of a scene line if it starts with '[' and ends with ']'
        if text.startswith('[') and text.endswith(']'):
            # Example: [Scene: The Park]
            # Extract the scene name
            current_scene = text[1:-1]  # Remove the square brackets
            continue

        # Attempt to parse lines of the form:
        # <b>CharacterName:</b> Some text here
        bold_tag = p.find('b')
        if bold_tag:
            speaker = bold_tag.get_text(strip=True).rstrip(':')
            # The rest of the paragraph, after the bold tag, is the spoken text
            # One naive approach: remove the bold tag from the soup, then get remaining text
            bold_tag.decompose()  # remove bold from paragraph
            line_text = p.get_text(strip=True)

            if speaker and line_text:
                dialogue_entry = {
                    'season': season,
                    'episode': episode,
                    'speaker': speaker.upper(),  # standardize to uppercase
                    'text': line_text,
                    'scene': current_scene
                }
                dialogue_data.append(dialogue_entry)

    return dialogue_data

# -------------------------------------------------
# 4) Main script: get all links, iterate, parse, and save
# -------------------------------------------------
def main():
    # 1) Get all episode links
    episode_links = get_episode_links()

    # For demonstration, limit scraping to 2 or 3 links during testing
    # Remove or adjust once you trust your parser
    # episode_links = episode_links[:3]

    # 2) Open a CSV to save your results
    # Adjust the columns to your needs
    with open("regular_show_transcripts.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        # Write header
        writer.writerow(["season", "episode", "speaker", "text", "scene", "url"])

        # 3) Loop over each episode link and parse
        for i, link in enumerate(episode_links, start=1):
            print(f"Scraping {i}/{len(episode_links)}: {link}")

            episode_dialogue = parse_episode_transcript(link)
            for entry in episode_dialogue:
                writer.writerow([
                    entry['season'],
                    entry['episode'],
                    entry['speaker'],
                    entry['text'],
                    entry['scene'],
                    link  # store the URL for reference
                ])

            # Delay to avoid spamming the server
            time.sleep(2)


if __name__ == "__main__":
    main()
