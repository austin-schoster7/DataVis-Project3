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
    let wordCounts = d3.rollups(
      words,
      v => v.length,
      d => d
    ).map(([word, count]) => ({ text: word, size: count }));

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
      .fontSize(d => Math.min(100, Math.max(10, d.size * 3)))
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

  // initial draw & bind dropdown now that functions exist
  updateCharts();
  seasonSelect.on('change', () => {
    updateCharts();
    if (currentCharacter) showDetail(currentCharacter);
  });
});
