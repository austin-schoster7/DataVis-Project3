// script.js


// 0) Create a tooltip div
const tooltip = d3.select('body')
  .append('div')
  .attr('class', 'tooltip')
  .style('position', 'absolute')
  .style('background', 'rgba(0, 0, 0, 0.75)')
  .style('color', '#fff')
  .style('padding', '6px 10px')
  .style('border-radius', '4px')
  .style('pointer-events', 'none')
  .style('font-size', '12px')
  .style('opacity', 0);

// Track the currently selected character
let currentCharacter = null;

Promise.all([
  d3.json('../data/character_summary.json'),
  d3.json('../data/season_summary.json'),
  d3.json('../data/episode_summary.json'),
  d3.csv('../data/regular_show_transcripts.csv')
]).then(([allData, seasonData, episodeData, transcriptData]) => {
  const seasonSelect = d3.select('#season');

  // 1) Draw/update the bar charts
  function updateCharts() {
    const season = seasonSelect.property('value');
    let byEp, byW;

    if (season === 'all') {
      byEp = allData.slice()
        .sort((a, b) => b.totalEpisodes - a.totalEpisodes)
        .slice(0, 10);
      byW = allData.slice()
        .sort((a, b) => b.totalWords - a.totalWords)
        .slice(0, 10);
    } else {
      const s = +season;
      const grouped = d3.rollups(
        seasonData.filter(d => d.season === s),
        v => ({
          totalEpisodes: new Set(v.flatMap(d => d.episodes)).size,
          totalWords: d3.sum(v, d => d.words)
        }),
        d => d.character
      ).map(([character, stats]) => ({ character, ...stats }));

      byEp = grouped.sort((a, b) => b.totalEpisodes - a.totalEpisodes).slice(0, 10);
      byW = grouped.sort((a, b) => b.totalWords - a.totalWords).slice(0, 10);
    }

    drawBar('#episodes-chart',
      byEp, 'totalEpisodes', 'Episodes',
      'Top 10 Characters by Episodes');
    drawBar('#words-chart',
      byW, 'totalWords', 'Words',
      'Top 10 Characters by Words');

    updateWordCloud();

    const phraseData = countSpecialPhrases(season);
    drawPhraseChart('#phrases-chart', phraseData);
    
    const arcData = getCooccurrenceData(transcriptData, season);
    drawArcDiagram(arcData);
      
  }

  const stopwords = new Set([
    // Basic English stopwords
    'the', 'and', 'that', 'have', 'for', 'not', 'with', 'you', 'this', 'but',
    'his', 'from', 'they', 'will', 'would', 'there', 'their', 'what', 'about',
    'which', 'were', 'when', 'your', 'said', 'could', 'been', 'them', 'than',

    // Regular Show specific additions
    'hey', 'uh', 'um', 'oh', 'ah', 'huh', 'ha', 'yo', 'duh', 'ugh', 'whoa',
    'gonna', 'wanna', 'gotta', 'kinda', 'sorta', 'like', 'just', 'really',
    'right', 'well', 'back', 'get', 'got', 'see', 'know', 'think', 'look',
    'come', 'go', 'one', 'even', 'still', 'also', 'okay', 'yes', 'no', 'maybe', 'th'
  ]);

  function simpleStem(word) {
    // Basic stemming - remove common endings
    return word
      .replace(/'s$/, '')      // Remove possessive
      .replace(/s$/, '')       // Remove simple plurals
      .replace(/ing$/, '')     // Remove -ing
      .replace(/ly$/, '')      // Remove -ly
      .replace(/ed$/, '');     // Remove -ed
  }

  function updateWordCloud() {
    const season = seasonSelect.property('value');
    const character = d3.select('#character').property('value');

    if (!character) {
      d3.select('#cloud-container').html('<p>Select a character to see their word frequency</p>');
      return;
    }

    // Filter transcripts
    let filtered = transcriptData.filter(d => d.speaker === character.toUpperCase());
    if (season !== 'all') filtered = filtered.filter(d => +d.season === +season);

    // Process words with all filters
    const words = filtered.flatMap(d => {
      const cleanText = d.text
        .replace(/\(.*?\)/g, '')
        .replace(/[^\w\s'-]/g, '')
        .toLowerCase()
        .split(/\s+/)
        .filter(word => {
          return word.length > 2 &&
            !stopwords.has(word) &&
            !/\d/.test(word) &&
            !/^[a-z]$/.test(word) &&
            !/^[^aeiou]{3,}$/i.test(word);
        })
      //.map(word => simpleStem(word));
      return cleanText;
    });

    // Count words
    const wordCounts = d3.rollups(
      words,
      group => group.length, // Raw count of occurrences
      word => word // Group by exact word
    ).map(([word, count]) => ({ text: word, size: count }));


    const maxCount = d3.max(wordCounts, d => d.size);
    const minCount = d3.min(wordCounts, d => d.size);

    // Create a logarithmic scale for better visual distribution
    const sizeScale = d3.scaleLog()
      .domain([minCount, maxCount])
      .range([10, 100]);  // min and max font sizes

    /*// Apply minimum occurrences
    const minOccurrences = season === 'all' ? 5 : 3;
    wordCounts = wordCounts.filter(d => d.size >= minOccurrences);

    // Group similar words
    const stemGroups = d3.rollups(
      wordCounts,
      group => ({
        text: group[0].text,
        size: d3.sum(group, d => d.size)
      }),
      d => simpleStem(d.text)
    );

    let meaningfulWords = stemGroups
      .map(([stem, group]) => group)
      .sort((a, b) => b.size - a.size)
      .slice(0, 80);*/

    // Apply character-specific filters
    /*if (character === 'Muscle Man') {
      meaningfulWords = meaningfulWords.filter(d => d.text !== 'know');
    }*/

    // Create cloud
    d3.select('#cloud-container').html('');
    const width = 700, height = 400;

    const svg = d3.select('#cloud-container')
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${width / 2},${height / 2})`);

    const layout = d3.layout.cloud()
      .size([width, height])
      .words(wordCounts)
      .padding(5)
      .rotate(() => (Math.random() - 0.5) * 60)
      .font('Impact')
      .fontSize(d => sizeScale(d.size))  // Use the scale here
      .on('end', drawCloud);

    layout.start();

    function drawCloud(words) {
      svg.selectAll('text')
        .data(words)
        .enter()
        .append('text')
        .style('font-size', d => `${d.size}px`)
        .style('font-family', 'Impact')
        .style('fill', (d, i) => d3.schemeCategory10[i % 10])
        .attr('text-anchor', 'middle')
        .attr('transform', d => `translate(${[d.x, d.y]})rotate(${d.rotate})`)
        .text(d => d.text)
        // Add these event handlers for tooltips
        .on('mouseover', function (event, d) {
          // Show tooltip
          tooltip
            .html(`<strong>${d.text}</strong><br>Appears ${d.size} times`)
            .style('opacity', 1);
        })
        .on('mousemove', function (event) {
          // Position tooltip near mouse
          tooltip
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 20) + 'px');
        })
        .on('mouseout', function () {
          // Hide tooltip
          tooltip.style('opacity', 0);
        });
    }
  }

  function countSpecialPhrases(season) {
    // Define the phrases we want to track (case insensitive)
    const phrases = [
      'dude', 'bro', 'hmph', 'ooohhhh',
      'you\'re fired', 'my mom', 'jolly good show'
    ];

    // Filter transcripts by season if needed
    let filtered = transcriptData;
    if (season !== 'all') {
      filtered = filtered.filter(d => +d.season === +season);
    }

    // Count occurrences of each phrase
    const phraseCounts = phrases.map(phrase => {
      // Create regex pattern to match whole phrase (case insensitive)
      const regex = new RegExp(`\\b${phrase}\\b`, 'gi');
      let count = 0;

      // Count matches in all transcripts
      filtered.forEach(line => {
        const matches = line.text.match(regex);
        if (matches) count += matches.length;
      });

      return {
        phrase: phrase.charAt(0).toUpperCase() + phrase.slice(1), // Capitalize
        count: count
      };
    });

    return phraseCounts;
  }

  function drawPhraseChart(container, data) {
    const width = 700,
      height = 350,
      margin = { top: 50, right: 20, bottom: 100, left: 60 };

    const sel = d3.select(container);
    sel.selectAll('*').remove();

    sel.append('h2')
      .text('Special Phrase Frequency')
      .style('text-align', 'center')
      .style('margin', '0 0 10px 0');

    const x = d3.scaleBand()
      .domain(data.map(d => d.phrase))
      .range([margin.left, width - margin.right])
      .padding(0.1);

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.count)]).nice()
      .range([height - margin.bottom, margin.top]);

    const svg = sel.append('svg')
      .attr('width', width)
      .attr('height', height);

    // Add bars
    svg.append('g')
      .selectAll('rect')
      .data(data)
      .join('rect')
      .attr('x', d => x(d.phrase))
      .attr('y', d => y(d.count))
      .attr('width', x.bandwidth())
      .attr('height', d => height - margin.bottom - y(d.count))
      .attr('fill', '#4CAF50')
      .on('mouseover', (event, d) => {
        tooltip
          .html(`<strong>${d.phrase}</strong><br>${d.count} occurrences`)
          .style('opacity', 1);
      })
      .on('mousemove', event => {
        tooltip
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY + 10) + 'px');
      })
      .on('mouseout', () => {
        tooltip.style('opacity', 0);
      });

    // Add x-axis with rotated labels
    svg.append('g')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x))
      .selectAll('text')
      .attr('transform', 'rotate(-45)')
      .attr('text-anchor', 'end')
      .attr('dx', '-0.5em')
      .attr('dy', '0.5em');

    // Add y-axis
    svg.append('g')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(y));

    // Add y-axis label
    svg.append('text')
      .attr('class', 'axis-label')
      .attr('transform', 'rotate(-90)')
      .attr('x', -(height / 2))
      .attr('y', margin.left - 40)
      .attr('text-anchor', 'middle')
      .text('Number of Occurrences');
  }

  const topCharacters = ['MORDECAI', 'RIGBY', 'MUSCLE MAN', 'BENSON', 'POPS', 'SKIPS', 'HI-FIVE GHOST', 'EILEEN', 'MARGARET', 'CJ']

  function getCooccurrenceData(transcriptData, seasonFilter = 'all', windowSize = 5) {
    const cooccurrence = new Map();
  
    // Season filter
    let data = transcriptData;
    if (seasonFilter !== 'all') {
      data = transcriptData.filter(d => +d.season === +seasonFilter);
    }
  
    // Sort by season, episode, and line number
    data.sort((a, b) => {
      return +a.season - +b.season ||
             +a.episode - +b.episode ||
             +a.line_number - +b.line_number;
    });
  
    // Sliding window logic
    for (let i = 0; i < data.length; i++) {
      const baseSpeaker = data[i].speaker;
      const windowEnd = Math.min(i + windowSize, data.length);
      if (topCharacters.includes(baseSpeaker)) {
        for (let j = i + 1; j < windowEnd; j++) {
          const otherSpeaker = data[j].speaker;
  
          // Skip self-pairing and duplicate pairing
          if (baseSpeaker !== otherSpeaker && topCharacters.includes(baseSpeaker) && topCharacters.includes(otherSpeaker)) {
            const pair = [baseSpeaker, otherSpeaker].sort();
            const key = `${pair[0]}|${pair[1]}`;
            cooccurrence.set(key, (cooccurrence.get(key) || 0) + 1);
          }
        }
      }
    }
  
    // Format nodes and links
    const allCharacters = new Set();
    const links = Array.from(cooccurrence.entries()).map(([pair, value]) => {
      const [source, target] = pair.split('|');
      allCharacters.add(source);
      allCharacters.add(target);
      return { source, target, value };
    });
  
    const nodes = Array.from(allCharacters).map(id => ({ id }));
  
    return { nodes, links };
  }

  const colorMap = { 'MORDECAI' : '#11a1f0',
                      'RIGBY' : '#75501f', 
                      'MUSCLE MAN' : '#0bf193', 
                      'BENSON' : '#a9063e', 
                      'POPS' : '#ff4cae', 
                      'SKIPS' : '#f49c11', 
                      'HI-FIVE GHOST' : 'purple', 
                      'EILEEN' : '#b48d6c', 
                      'MARGARET' : 'red', 
                      'CJ' : 'yellow' }

  function drawArcDiagram({ nodes, links }, container = '#arc-diagram') {
    const width = 1000;
    const height = 600;
    const bottom = height - 100;
    const radius = 5;
  
    d3.select(container).selectAll('*').remove();
    const svg = d3.select(container).append('svg')
      .attr('width', width)
      .attr('height', height);
  
    const nodeOrder = nodes.map(d => d.id).sort();
    const x = d3.scalePoint()
      .domain(nodeOrder)
      .range([50, width - 50]);
  
    // Draw arcs and keep reference
    const arcGroup = svg.append('g');
    const arcPaths = arcGroup
      .selectAll('path')
      .data(links)
      .join('path')
      .attr('fill', 'none')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', d => Math.sqrt(d.value) * 0.5)
      .attr('d', d => {
        const x1 = x(d.source), x2 = x(d.target);
        const r = Math.abs(x2 - x1) / 2;
        return `M${x1},${bottom} A${r},${r} 0 0,1 ${x2},${bottom}`;
      });

    let activeCharacter = null;
  
    // Draw nodes
    svg.append('g')
      .selectAll('circle')
      .data(nodes)
      .join('circle')
      .attr('cx', d => x(d.id))
      .attr('cy', bottom)
      .attr('r', radius)
      .attr('fill', 'steelblue')
      .style('cursor', 'pointer')
      .on('mouseover', (event, d) => {
        tooltip
          .html(`<strong>${d.id}</strong>`)
          .style('opacity', 1);
      })
      .on('mousemove', (event) => {
        tooltip
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 20) + 'px');
      })
      .on('mouseout', () => tooltip.style('opacity', 0))
      .on('click', (event, d) => {
        const selectedId = d.id;
      
        if (activeCharacter === selectedId) {
          // Deselect if the same node is clicked again
          activeCharacter = null;
          arcPaths
            .attr('stroke', '#999')
            .attr('stroke-opacity', 0.6);
        } else {
          activeCharacter = selectedId;
          const selectedColor = colorMap[selectedId];
      
          arcPaths
            .attr('stroke', link =>
              link.source === selectedId || link.target === selectedId
                ? selectedColor
                : '#999'
            )
            .attr('stroke-opacity', link =>
              link.source === selectedId || link.target === selectedId
                ? 1
                : 0.2
            );
        }
      });
      
      
  
    // Add labels
    svg.append('g')
      .selectAll('text')
      .data(nodes)
      .join('text')
      .attr('x', d => x(d.id))
      .attr('y', bottom + 20)
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .text(d => d.id);
  }
  
  
  


  // Add event listeners for the new controls
  d3.select('#character').on('change', updateWordCloud);
  seasonSelect.on('change', () => {
    updateCharts();
    if (currentCharacter) showDetail(currentCharacter);
    updateWordCloud(); // Also update word cloud on season change
  });

  // Initial call to show placeholder
  updateWordCloud();

  // 2) Helper: draw a bar chart
  function drawBar(container, data, key, xAxisLabel, titleText) {
    const width = 700,
      height = 350,
      margin = { top: 50, right: 20, bottom: 50, left: 140 };

    const sel = d3.select(container);
    sel.selectAll('*').remove();

    sel.append('h2')
      .text(titleText)
      .style('text-align', 'center')
      .style('margin', '0 0 10px 0');

    const x = d3.scaleLinear()
      .domain([0, d3.max(data, d => d[key])]).nice()
      .range([margin.left, width - margin.right]);

    const y = d3.scaleBand()
      .domain(data.map(d => d.character))
      .range([margin.top, height - margin.bottom])
      .padding(0.1);

    const svg = sel.append('svg')
      .attr('width', width)
      .attr('height', height);

    // Bars with pointer cursor & custom tooltip
    const bars = svg.append('g')
      .selectAll('rect')
      .data(data)
      .join('rect')
      .attr('class', 'bar')
      .style('cursor', 'pointer')
      .attr('x', x(0))
      .attr('y', d => y(d.character))
      .attr('width', d => x(d[key]) - x(0))
      .attr('height', y.bandwidth())
      .on('mouseover', (event, d) => {
        tooltip
          .html(`<strong>${d.character}</strong><br>${d[key]} ${xAxisLabel}`)
          .style('opacity', 1);
      })
      .on('mousemove', event => {
        tooltip
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY + 10) + 'px');
      })
      .on('mouseout', () => {
        tooltip.style('opacity', 0);
      })
      .on('click', (event, d) => {
        currentCharacter = d.character;
        showDetail(d.character);
      });

    svg.append('g')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(5));

    svg.append('text')
      .attr('class', 'axis-label')
      .attr('x', margin.left + (width - margin.left - margin.right) / 2)
      .attr('y', height - margin.bottom + 35)
      .attr('text-anchor', 'middle')
      .text(xAxisLabel);

    svg.append('g')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(y));
  }

  // 3) Draw the detail view
  function showDetail(character) {
    currentCharacter = character;
    const dv = d3.select('#detail-view');
    dv.selectAll('*').remove();

    // Title with current season
    const seasonVal = seasonSelect.property('value');
    const seasonLabel = seasonVal === 'all'
      ? 'All Seasons'
      : `Season ${seasonVal}`;
    dv.append('h3')
      .text(`${character}: Lines per Episode (${seasonLabel})`)
      .style('text-align', 'center')
      .style('margin-bottom', '10px');

    // Filter & sort all episodes for this character
    let data = episodeData.filter(d => d.character === character);
    data.sort((a, b) => a.season - b.season || a.episode - b.episode);

    if (!data.length) {
      dv.append('p')
        .style('text-align', 'center')
        .text('No episode data found.');
      return;
    }

    const seasons = Array.from(new Set(data.map(d => d.season))).sort();
    const maxEpisode = d3.max(data, d => d.episode);
    const w = 700, h = 300, m = { top: 30, right: 20, bottom: 60, left: 60 };

    const x = d3.scaleLinear()
      .domain([1, maxEpisode])
      .range([m.left, w - m.right]);
    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.lines)]).nice()
      .range([h - m.bottom, m.top]);
    const color = d3.scaleOrdinal(d3.schemeCategory10).domain(seasons);

    const svg = dv.append('svg')
      .attr('width', w)
      .attr('height', h);

    // Draw one line+circle set per season, with toggle on click
    seasons.forEach(seasonNum => {
      const sd = data.filter(d => d.season === seasonNum);
      const isActive = seasonVal === 'all' || seasonNum === +seasonVal;
      const strokeOpacity = isActive ? 1 : 0.2;
      const fillOpacity = isActive ? 1 : 0.2;
      const strokeColor = isActive ? color(seasonNum) : '#999';

      // Line
      const lineGen = d3.line()
        .x(d => x(d.episode))
        .y(d => y(d.lines));
      svg.append('path')
        .datum(sd)
        .attr('fill', 'none')
        .attr('stroke', strokeColor)
        .attr('stroke-width', isActive ? 2.5 : 1.5)
        .attr('stroke-opacity', strokeOpacity)
        .style('cursor', 'pointer')
        .attr('d', lineGen)
        .on('click', () => {
          // toggle season selection
          const cur = seasonSelect.property('value');
          const next = (cur === String(seasonNum)) ? 'all' : String(seasonNum);
          seasonSelect.property('value', next);
          updateCharts();
          showDetail(character);
        });

      // Circles
      svg.append('g')
        .selectAll('circle')
        .data(sd)
        .join('circle')
        .attr('cx', d => x(d.episode))
        .attr('cy', d => y(d.lines))
        .attr('r', isActive ? 4 : 3)
        .attr('fill', strokeColor)
        .attr('fill-opacity', fillOpacity)
        .style('cursor', 'pointer')
        .on('mouseover', (event, d) => {
          tooltip
            .html(`Season ${d.season} – Episode ${d.episode}<br>${d.lines} lines`)
            .style('opacity', 1);
        })
        .on('mousemove', event => {
          tooltip
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY + 10) + 'px');
        })
        .on('mouseout', () => {
          tooltip.style('opacity', 0);
        })
        .on('click', () => {
          const cur = seasonSelect.property('value');
          const next = (cur === String(seasonNum)) ? 'all' : String(seasonNum);
          seasonSelect.property('value', next);
          updateCharts();
          showDetail(character);
        });
    });

    // X axis
    svg.append('g')
      .attr('transform', `translate(0,${h - m.bottom})`)
      .call(d3.axisBottom(x)
        .ticks(Math.min(maxEpisode, 10))
        .tickFormat(d3.format('d'))
      )
      .selectAll('text')
      .attr('transform', 'rotate(-45)')
      .attr('text-anchor', 'end')
      .attr('dx', '-0.5em')
      .attr('dy', '0.25em');

    // X label
    svg.append('text')
      .attr('class', 'axis-label')
      .attr('x', m.left + (w - m.left - m.right) / 2)
      .attr('y', h - 15)
      .attr('text-anchor', 'middle')
      .text('Episode');

    // Y axis + label
    svg.append('g')
      .attr('transform', `translate(${m.left},0)`)
      .call(d3.axisLeft(y))
      .append('text')
      .attr('class', 'axis-label')
      .attr('transform', 'rotate(-90)')
      .attr('x', -(m.top + (h - m.top - m.bottom) / 2))
      .attr('y', -40)
      .attr('text-anchor', 'middle')
      .text('Lines');

    // Legend below chart
    const legend = dv.append('div')
      .style('text-align', 'center')
      .style('margin', '10px 0');
    seasons.forEach(s => {
      const item = legend.append('span')
        .style('display', 'inline-flex')
        .style('align-items', 'center')
        .style('margin', '0 8px')
        .style('cursor', 'pointer');
      item.append('svg')
        .attr('width', 12)
        .attr('height', 12)
        .append('rect')
        .attr('width', 12)
        .attr('height', 12)
        .attr('fill', color(s));
      item.append('span')
        .text(` Season ${s}`);
    });
  }

    // ——— Level 4: Phrase search ———
    d3.select('#search-button').on('click', updateSearch);

    function updateSearch() {
        const raw = d3.select('#search-input').property('value').trim().toLowerCase();
        if (!raw) return;

        // 1) Find all transcript rows containing the phrase
        const hits = transcriptData
        .map(d => ({
            season: +d.season,
            episode: +d.episode,
            speaker: d.speaker,
            text: d.text.toLowerCase(),
        }))
        .filter(d => d.text.includes(raw));

        if (hits.length === 0) {
        d3.select('#search-chart').html(`<p>No occurrences of “${raw}” found.</p>`);
        d3.select('#search-speakers').html('');
        return;
        }

        // 2) Count occurrences per episode
        const freqByEp = Array.from(
        d3.rollups(
            hits,
            v => v.length,
            d => `${d.season}-${d.episode}`
        ),
        ([se, count]) => {
            const [s,e] = se.split('-').map(Number);
            return { season: s, episode: e, count };
        }
        ).sort((a,b) => a.season - b.season || a.episode - b.episode);

        // 3) Draw a line chart of count vs. episode
        drawSearchTrend(freqByEp, raw);

        // 4) Count which speakers say it most
        const speakerCounts = Array.from(
        d3.rollups(
            hits,
            v => v.length,
            d => d.speaker
        ),
        ([speaker, count]) => ({ speaker, count })
        ).sort((a,b) => b.count - a.count).slice(0,10);

        drawSearchSpeakers(speakerCounts, raw);
    }

    function drawSearchTrend(data, phrase) {
        const container = d3.select('#search-chart').html('');
        container.append('h2')
          .text(`“${phrase}” occurrences per episode`);
      
        const w = 700, h = 300, m = { top:40, right:20, bottom:80, left:60 };
        const svg = container.append('svg')
          .attr('width', w).attr('height', h);
      
        // Build a unique key per episode
        const keys = data.map(d => `${d.season}-${d.episode}`);
      
        // 1) use a point scale so episodes are evenly spaced
        const x = d3.scalePoint()
          .domain(keys)
          .range([m.left, w - m.right])
          .padding(0.5);
      
        const y = d3.scaleLinear()
          .domain([0, d3.max(data, d => d.count)]).nice()
          .range([h - m.bottom, m.top]);
      
        const line = d3.line()
          .x(d => x(`${d.season}-${d.episode}`))
          .y(d => y(d.count));
      
        // Draw line
        svg.append('path')
          .datum(data)
          .attr('fill','none')
          .attr('stroke','steelblue')
          .attr('stroke-width',2)
          .attr('d', line);
      
        // Draw circles + tooltip
        svg.selectAll('circle')
          .data(data)
          .join('circle')
            .attr('cx', d => x(`${d.season}-${d.episode}`))
            .attr('cy', d => y(d.count))
            .attr('r', 4)
            .attr('fill','steelblue')
            .on('mouseover', (ev,d) => {
              tooltip
                .html(`S${d.season} E${d.episode}<br>${d.count} hits`)
                .style('opacity',1);
            })
            .on('mousemove', ev => {
              tooltip
                .style('left', (ev.pageX + 10) + 'px')
                .style('top',  (ev.pageY + 10) + 'px');
            })
            .on('mouseout', () => tooltip.style('opacity',0));
      
        // X axis: show every Nth tick to avoid overlap
        const tickEvery = Math.ceil(keys.length / 10);
        const ticks = keys.filter((_,i) => i % tickEvery === 0);
      
        svg.append('g')
          .attr('transform', `translate(0,${h - m.bottom})`)
          .call(d3.axisBottom(x)
            .tickValues(ticks)
            .tickFormat(k => {
              const [s,e] = k.split('-');
              return `S${s}E${e}`;
            })
          )
          .selectAll('text')
            .attr('transform','rotate(-45)')
            .attr('text-anchor','end');
      
        // X label
        svg.append('text')
          .attr('class','axis-label')
          .attr('x', m.left + (w - m.left - m.right)/2)
          .attr('y', h - 10)
          .attr('text-anchor','middle')
          .text('Episode');
      
        // Y axis
        svg.append('g')
          .attr('transform', `translate(${m.left},0)`)
          .call(d3.axisLeft(y))
          .append('text')
            .attr('class','axis-label')
            .attr('transform','rotate(-90)')
            .attr('x', -(m.top + (h - m.top - m.bottom)/2))
            .attr('y', -45)
            .attr('text-anchor','middle')
            .text('Count');
    }

    function drawSearchSpeakers(data, phrase) {
        const container = d3.select('#search-speakers').html('');
        container.append('h2')
          .text(`Who says “${phrase}” most often?`);
      
        const w = 700, h = 350, m = { top:40, right:20, bottom:50, left:140 };
        const svg = container.append('svg')
          .attr('width', w).attr('height', h);
      
        const x = d3.scaleLinear()
          .domain([0, d3.max(data, d => d.count)]).nice()
          .range([m.left, w - m.right]);
      
        const y = d3.scaleBand()
          .domain(data.map(d => d.speaker))
          .range([m.top, h - m.bottom])
          .padding(0.1);
      
        // DRAW BARS with tooltip
        svg.append('g')
          .selectAll('rect')
          .data(data)
          .join('rect')
            .attr('class','bar')
            .attr('x', x(0))
            .attr('y', d => y(d.speaker))
            .attr('width', d => x(d.count) - x(0))
            .attr('height', y.bandwidth())
            .style('cursor','default')
            .on('mouseover', (ev,d) => {
              tooltip
                .html(`<strong>${d.speaker}</strong><br>${d.count} times`)
                .style('opacity',1);
            })
            .on('mousemove', ev => {
              tooltip
                .style('left', (ev.pageX + 10) + 'px')
                .style('top',  (ev.pageY + 10) + 'px');
            })
            .on('mouseout', () => tooltip.style('opacity',0));
      
        // X axis
        svg.append('g')
          .attr('transform',`translate(0,${h-m.bottom})`)
          .call(d3.axisBottom(x).ticks(5));
        svg.append('text')
          .attr('class','axis-label')
          .attr('x', m.left + (w-m.left-m.right)/2)
          .attr('y', h-m.bottom+35)
          .attr('text-anchor','middle')
          .text('Count');
      
        // Y axis
        svg.append('g')
          .attr('transform',`translate(${m.left},0)`)
          .call(d3.axisLeft(y));
    }

    // 4) Load & draw the network
    d3.json('../data/cooccurrence.json').then(graph => {
        const width   = 700,
              height  = 500,
              MIN_LINK = 10;               // only show edges ≥ 20 scenes
        // 1) filter links & nodes
        const links = graph.links.filter(l => l.value >= MIN_LINK);
        const nodeIds = new Set();
        links.forEach(l => {
          nodeIds.add(l.source);
          nodeIds.add(l.target);
        });
        const nodes = graph.nodes.filter(n => nodeIds.has(n.id));
      
        // 2) SVG + zoom container
        const svg   = d3.select('#cooccurrence-chart')
                        .append('svg')
                          .attr('width', width)
                          .attr('height', height);
        const mainG = svg.append('g');
        svg.call(d3.zoom()
            .extent([[0,0],[width,height]])
            .scaleExtent([0.5,5])
            .on('zoom', e => mainG.attr('transform', e.transform))
        );
      
        // 3) simulation with collide
        const sim = d3.forceSimulation(nodes)
            .force('link',   d3.forceLink(links).id(d=>d.id).distance(100).strength(0.2))
            .force('charge', d3.forceManyBody().strength(-200))
            .force('center', d3.forceCenter(width/2, height/2))
            .force('collide', d3.forceCollide(12));
      
        // 4) draw links
        const link = mainG.append('g')
            .attr('stroke','#999')
            .selectAll('line')
            .data(links)
            .join('line')
              .attr('stroke-width', d=>Math.sqrt(d.value));
      
        // 5) draw nodes
        const node = mainG.append('g')
            .selectAll('circle')
            .data(nodes)
            .join('circle')
              .attr('r', 6)
              .attr('fill','steelblue')
              .style('cursor','pointer')
              .call(d3.drag()
                .on('start', dragstarted)
                .on('drag', dragged)
                .on('end', dragended)
              );
      
        // 6) click to toggle highlight / deselect
        let selected = null;
        node.on('click', (ev, d) => {
          if (selected === d.id) {
            // deselect
            node.attr('opacity', 1);
            node.attr('fill', 'steelblue');
            link.attr('opacity', 1);
            selected = null;
          } else {
            selected = d.id;
            // find its neighbors
            const nbrs = new Set(
              links
                .filter(l => l.source.id === d.id || l.target.id === d.id)
                .flatMap(l => [l.source.id, l.target.id])
            );
            node.attr('fill', n => {
              if (n.id === d.id) return 'orange';
              return nbrs.has(n.id) ? 'lightgreen' : '#999';
            });
            node.attr('opacity', n => nbrs.has(n.id) || n.id === d.id ? 1 : 0.1);
            link.attr('opacity', l =>
              l.source.id === d.id || l.target.id === d.id ? 1 : 0.1
            );
          }
        });
      
        // 7) tooltips
        node
          .on('mouseover', (ev, d) => tooltip.html(`<strong>${d.id}</strong>`).style('opacity',1))
          .on('mousemove', (ev)  => tooltip.style('left', (ev.pageX+10)+'px').style('top', (ev.pageY+10)+'px'))
          .on('mouseout', ()     => tooltip.style('opacity',0));
      
        // 8) optional labels
        const label = mainG.append('g')
            .selectAll('text')
            .data(nodes)
            .join('text')
              .attr('dx', 8)
              .attr('dy', 4)
              .text(d=>d.id)
              .style('pointer-events','none')
              .style('font-size','10px');
      
        // 9) on tick
        sim.on('tick', () => {
          link
            .attr('x1', d=>d.source.x)
            .attr('y1', d=>d.source.y)
            .attr('x2', d=>d.target.x)
            .attr('y2', d=>d.target.y);
          node
            .attr('cx', d=>d.x)
            .attr('cy', d=>d.y);
          label
            .attr('x', d=>d.x)
            .attr('y', d=>d.y);
        });
      
        // drag helpers
        function dragstarted(event, d) {
          if (!event.active) sim.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        }
        function dragged(event, d) {
          d.fx = event.x; d.fy = event.y;
        }
        function dragended(event, d) {
          if (!event.active) sim.alphaTarget(0);
          d.fx = null; d.fy = null;
        }
      });

// ─── Level 4: “Who speaks when” single-episode timeline ───
d3.json('../data/timing.json').then(timingData => {
    // selectors
    const sel1     = d3.select('#when-char1');
    const sel2     = d3.select('#when-char2');
    const epSelect = d3.select('#when-episode');
  
    // populate chars
    const chars = allData.map(d => d.character);
    [sel1, sel2].forEach(sel => {
      sel.selectAll('option')
        .data([''].concat(chars))
        .join('option')
          .attr('value', d => d)
          .text(d => d || '-- none --');
    });
  
    // populate eps
    const eps = Array.from(new Set(
        timingData.map(d => `${d.season}-${d.episode}`)
      ))
      .sort((a,b) => {
        const [s1,e1]=a.split('-').map(Number),
              [s2,e2]=b.split('-').map(Number);
        return s1!==s2? s1-s2 : e1-e2;
      });
    epSelect.selectAll('option.ep')
      .data(eps)
      .join('option')
        .attr('class','ep')
        .attr('value', d => d)
        .text(d => {
          const [s,e] = d.split('-');
          return `Season ${s} Episode ${e}`;
        });
  
    // bind all three
    [sel1, sel2, epSelect].forEach(sel => sel.on('change', drawWhen));
  
    function drawWhen() {
      const c1    = sel1.property('value'),
            c2    = sel2.property('value'),
            epVal = epSelect.property('value'),
            container = d3.select('#when-chart');
  
      // clear old
      container.selectAll('svg').remove();
      container.selectAll('.msg').remove();
  
      // need at least one char + an episode
      if (!epVal || (!c1 && !c2)) {
        container.append('p')
          .attr('class','msg')
          .text('Select two characters and an episode.');
        return;
      }
  
      // parse S & E
      const [seasonNum, episodeNum] = epVal.split('-').map(Number);
  
      // find their records
      const recsRaw = [
        { character: c1, rec: timingData.find(d =>
            d.character===c1 && d.season===seasonNum && d.episode===episodeNum
          )
        },
        { character: c2, rec: timingData.find(d =>
            d.character===c2 && d.season===seasonNum && d.episode===episodeNum
          )
        }
      ];
  
      // separate out those that have data
      const recs = recsRaw.filter(d => d.rec).map(d => d.rec);
      const missing = recsRaw.filter(d => !d.rec).map(d => d.character);
  
      // if none have data
      if (recs.length === 0) {
        container.append('p')
          .attr('class','msg')
          .text(`Neither ${c1} nor ${c2} speaks in Season ${seasonNum}, Episode ${episodeNum}.`);
        return;
      }
  
      // if one is missing, show notice
      if (missing.length) {
        container.append('p')
          .attr('class','msg')
          .text(`${missing.join(' and ')} has no lines in S${seasonNum}E${episodeNum}.`);
      }
  
      // build chart for recs.length (1 or 2)
      const chosen = recs.map(r => r.character);
      const w = 700, h = 300, m = { top:40, right:20, bottom:40, left:100 };
      const svg = container.append('svg')
        .attr('width', w)
        .attr('height', h);
  
      const x = d3.scaleLinear().domain([0,1]).range([m.left, w-m.right]);
      const y = d3.scalePoint()
        .domain(chosen)
        .range([m.top, h-m.bottom])
        .padding(0.5);
  
      const color = d3.scaleOrdinal()
        .domain(chosen)
        .range(['steelblue','orange']);
  
      const jitter = 10;
  
      recs.forEach(rec => {
        svg.append('g')
          .selectAll('circle')
          .data(rec.positions)
          .join('circle')
            .attr('cx', p => x(p))
            .attr('cy', () => y(rec.character) + (Math.random()-0.5)*jitter)
            .attr('r', 3)
            .attr('fill', color(rec.character))
            .attr('opacity', 0.7)
          .on('mouseover', (ev,p) => {
            tooltip
              .html(
                `<strong>${rec.character}</strong><br>` +
                `S${rec.season}E${rec.episode}<br>` +
                `${Math.round(p*100)}% into episode`
              )
              .style('opacity',1);
          })
          .on('mousemove', ev => {
            tooltip
              .style('left', (ev.pageX+8)+'px')
              .style('top',  (ev.pageY+8)+'px');
          })
          .on('mouseout', () => tooltip.style('opacity',0));
      });
  
      // axes
      svg.append('g')
        .attr('transform', `translate(0,${h-m.bottom})`)
        .call(d3.axisBottom(x).tickFormat(d3.format('.0%')));

      // X axis label
      svg.append('text')
        .attr('class', 'axis-label')
        .attr('x', m.left + (w - m.left - m.right) / 2)
        .attr('y', h - m.bottom + 30)
        .attr('text-anchor', 'middle')
        .text('Position in Episode (% of dialogue)');
  
      svg.append('g')
        .attr('transform', `translate(${m.left},0)`)
        .call(d3.axisLeft(y));
    }
  });  

  // initial draw & bind dropdown now that functions exist
  updateCharts();
  seasonSelect.on('change', () => {
    updateCharts();
    if (currentCharacter) showDetail(currentCharacter);
  });
});
