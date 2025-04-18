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
  d3.json('../data/episode_summary.json')
]).then(([allData, seasonData, episodeData]) => {
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
          totalWords:    d3.sum(v, d => d.words)
        }),
        d => d.character
      ).map(([character, stats]) => ({ character, ...stats }));

      byEp = grouped.sort((a,b) => b.totalEpisodes - a.totalEpisodes).slice(0,10);
      byW  = grouped.sort((a,b) => b.totalWords     - a.totalWords)   .slice(0,10);
    }

    drawBar('#episodes-chart',
      byEp, 'totalEpisodes', 'Episodes',
      'Top 10 Characters by Episodes');
    drawBar('#words-chart',
      byW,  'totalWords',    'Words',
      'Top 10 Characters by Words');
  }

  // 2) Helper: draw a bar chart
  function drawBar(container, data, key, xAxisLabel, titleText) {
    const width  = 700,
          height = 350,
          margin = { top: 50, right: 20, bottom: 50, left: 140 };

    const sel = d3.select(container);
    sel.selectAll('*').remove();

    sel.append('h2')
       .text(titleText)
       .style('text-align','center')
       .style('margin','0 0 10px 0');

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
        .attr('class','bar')
        .style('cursor','pointer')
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
            .style('top',  (event.pageY + 10) + 'px');
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
      .attr('x', margin.left + (width - margin.left - margin.right)/2)
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
      .style('text-align','center')
      .style('margin-bottom','10px');

    // Filter & sort all episodes for this character
    let data = episodeData.filter(d => d.character === character);
    data.sort((a,b) => a.season - b.season || a.episode - b.episode);

    if (!data.length) {
      dv.append('p')
        .style('text-align','center')
        .text('No episode data found.');
      return;
    }

    const seasons    = Array.from(new Set(data.map(d => d.season))).sort();
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
      const fillOpacity   = isActive ? 1 : 0.2;
      const strokeColor   = isActive ? color(seasonNum) : '#999';

      // Line
      const lineGen = d3.line()
        .x(d => x(d.episode))
        .y(d => y(d.lines));
      svg.append('path')
        .datum(sd)
        .attr('fill','none')
        .attr('stroke', strokeColor)
        .attr('stroke-width', isActive ? 2.5 : 1.5)
        .attr('stroke-opacity', strokeOpacity)
        .style('cursor','pointer')
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
          .style('cursor','pointer')
          .on('mouseover', (event, d) => {
            tooltip
              .html(`Season ${d.season} – Episode ${d.episode}<br>${d.lines} lines`)
              .style('opacity', 1);
          })
          .on('mousemove', event => {
            tooltip
              .style('left', (event.pageX + 10) + 'px')
              .style('top',  (event.pageY + 10) + 'px');
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
        .attr('transform','rotate(-45)')
        .attr('text-anchor','end')
        .attr('dx','-0.5em')
        .attr('dy','0.25em');

    // X label
    svg.append('text')
      .attr('class','axis-label')
      .attr('x', m.left + (w - m.left - m.right)/2)
      .attr('y', h - 15)
      .attr('text-anchor','middle')
      .text('Episode');

    // Y axis + label
    svg.append('g')
      .attr('transform', `translate(${m.left},0)`)
      .call(d3.axisLeft(y))
      .append('text')
        .attr('class','axis-label')
        .attr('transform','rotate(-90)')
        .attr('x', -(m.top + (h - m.top - m.bottom)/2))
        .attr('y', -40)
        .attr('text-anchor','middle')
        .text('Lines');
  }

  // initial draw & bind dropdown now that functions exist
  updateCharts();
  seasonSelect.on('change', () => {
    updateCharts();
    if (currentCharacter) showDetail(currentCharacter);
  });
});
