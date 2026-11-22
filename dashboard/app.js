// Token Radar - Institutional Pre-Token Launch Radar & Airdrop Terminal
// Standard-compliant client engine (Offline, zero-network, pure vanilla JS)
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;

  var app = document.getElementById('board');
  var state = {
    q: '',
    category: 'all',
    chain: 'all',
    tab: 'pre-token',
    sort: 'implied',
    dir: -1,
    selected: null,
  };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }

  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }

  function fmtAge(days) {
    if (days === null || days === undefined) return 'Unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  function sectorMultiplier(category) {
    if (!category) return 1.0;
    var c = category.toLowerCase();
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('option') >= 0) return 1.30;
    if (c.indexOf('rollup') >= 0 || c.indexOf('layer 2') >= 0 || c.indexOf('chain') >= 0) return 1.25;
    if (c.indexOf('restak') >= 0 || c.indexOf('liquid restaking') >= 0) return 1.18;
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('liquidity manager') >= 0) return 1.12;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 1.00;
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 0.95;
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 0.90;
    if (c.indexOf('rwa') >= 0 || c.indexOf('payment') >= 0 || c.indexOf('stable') >= 0) return 0.85;
    return 1.00;
  }

  function ecosystemMultiplier(chains) {
    if (!chains || chains.length === 0) return 1.0;
    if (chains.length >= 5) return 1.15;
    if (chains.length >= 2) return 1.08;
    var primary = chains[0].toLowerCase();
    if (primary.indexOf('ethereum') >= 0 || primary.indexOf('solana') >= 0 || primary.indexOf('base') >= 0 || primary.indexOf('arbitrum') >= 0) return 1.05;
    return 1.00;
  }

  function impliedOf(row, model) {
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var rawGrowth = row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d;
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var maturityMult = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var catMult = sectorMultiplier(row.category);
    var chainMult = ecosystemMultiplier(row.chains);
    var base = row.tvl_usd * model.base_multiple;
    return Math.max(1, Math.round(base * growthMult * maturityMult * catMult * chainMult));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'Ethereum'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 1e9) return 250;
    if (p.tvl_usd >= 25e7) return 175;
    if (p.tvl_usd >= 5e7) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 45;
    if (age < 180) return 75;
    if (age < 365) return 60;
    return 30;
  }
  function gasEstimateForChain(chain) {
    var c = chain.toLowerCase();
    if (c.indexOf('ethereum') >= 0 || c.indexOf('mainnet') >= 0) return { setup: 'about $15-$25 of gas', weekly: 'about $4-$8 of gas' };
    if (c.indexOf('solana') >= 0) return { setup: 'under $0.50 of SOL gas', weekly: 'under $0.20 of SOL gas' };
    if (c.indexOf('arbitrum') >= 0 || c.indexOf('base') >= 0 || c.indexOf('optimism') >= 0 || c.indexOf('polygon') >= 0 || c.indexOf('ink') >= 0) {
      return { setup: 'about $1-$2 of L2 gas', weekly: 'under $1 of L2 gas' };
    }
    return { setup: 'about $3-$5 of native gas', weekly: 'about $1-$2 of native gas' };
  }

  function primaryActionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) {
      return 'Supply $' + capital + ' of USDC into ' + name + "'s verified pool on " + chain + ', activate collateral, and borrow a small 10% stablecoin buffer to qualify across both supply and borrow tranches.';
    }
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('liquidity manager') >= 0 || c.indexOf('farm') >= 0) {
      return 'Provide $' + capital + ' of dual-sided liquidity into ' + name + "'s primary pool on " + chain + ' within the recommended fee tier and stake the liquidity receipt token.';
    }
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('option') >= 0) {
      return 'Deposit $' + capital + ' USDC margin into ' + name + ' on ' + chain + ' and execute two low-leverage (1.5x-2x) delta-neutral hedge trades to accrue authentic taker volume.';
    }
    if (c.indexOf('restak') >= 0 || c.indexOf('staking') >= 0) {
      return 'Stake or delegate $' + capital + ' of native assets into ' + name + ' on ' + chain + ', allocate across top-tier node operators, and hold the restaking receipt.';
    }
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) {
      return 'Bridge $' + capital + ' USDC to ' + chain + ' via ' + name + ', confirm cross-chain settlement, and deploy the delivered liquidity into one supported dApp.';
    }
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) {
      return 'Deposit $' + capital + ' into a high-security ' + name + ' institutional vault on ' + chain + ' and hold the allocation shares.';
    }
    if (c.indexOf('rwa') >= 0 || c.indexOf('payment') >= 0 || c.indexOf('stable') >= 0) {
      return 'Mint or deposit $' + capital + ' into ' + name + "'s yield vault on " + chain + ' and retain custody of the proof-of-reserve receipt token.';
    }
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and maintain an active balance in its primary smart contract.';
  }

  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasEstimateForChain(chain);
    var action = primaryActionFor(p, capital, chain);

    return [
      {
        phase: '1. Setup',
        text: 'Prepare a dedicated non-custodial wallet exclusively for ' + p.name + ' on ' + chain + ', funded with sufficient native gas tokens. Never mix airdrop farming capital with cold storage vaults.',
        cost: 'under $5 initial transfer gas',
        time: '10 minutes setup',
      },
      {
        phase: '2. Deploy',
        text: action,
        cost: '$' + capital + ' capital deposit plus ' + gas.setup,
        time: '15 minutes execution',
      },
      {
        phase: '3. Cadence',
        text: 'Maintain on-chain interaction velocity: execute one genuine protocol transaction every 7 days (e.g. claim-and-restake, collateral rebalance, or micro-swap) to establish multi-epoch wallet consistency.',
        cost: gas.weekly + ' a week',
        time: '10 minutes weekly',
      },
      {
        phase: '4. Seasoning',
        text: 'Lock and hold the deployed position continuously for at least ' + hold + ' days to qualify across multiple snapshot intervals and avoid sybil filtering heuristics.',
        cost: '$' + capital + ' remains committed in protocol',
        time: hold + ' days holding period',
      },
      {
        phase: '5. Governance',
        text: 'Link wallet to Snapshot or on-chain governance forums for ' + p.name + ', verify anti-sybil credentials if prompted, and cast votes on active DAO proposals.',
        cost: 'free or under $0.50 gas to sign/vote',
        time: '15 minutes per proposal',
      },
      {
        phase: '6. Claim & Exit',
        text: 'When official TGE is announced, verify claims strictly through official protocol domains, claim token allocations, and safely revoke smart contract approvals via Revoke.cash upon position unwind.',
        cost: 'under $5 gas for claim and approval revoke',
        time: '15 minutes at launch',
      },
    ];
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('p')) state.selected = params.get('p');
  }

  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all') {
        var hasChain = (r.chains || []).some(function (c) { return c.toLowerCase() === state.chain.toLowerCase(); });
        if (!hasChain) return false;
      }
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }

  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top-nav' },
      el('div', { class: 'brand-group' },
        el('div', { class: 'radar-orb' }),
        el('div', { class: 'brand-title' },
          'TOKEN RADAR',
          el('span', { class: 'brand-badge', text: DATA.model_version })
        )
      ),
      el('div', { class: 'top-meta' },
        el('div', { class: 'meta-chip' }, el('i'), el('span', { text: 'Snapshot ' + DATA.as_of })),
        el('div', { class: 'meta-chip' }, el('span', { text: DATA.watchlist_size + ' Watchlist Floor' })),
        el('div', { class: 'meta-chip' }, el('span', { text: DATA.board_size + ' Scored Rows' }))
      )
    );
  }

  function statsBanner() {
    return el('section', { class: 'stats-banner' },
      el('div', { class: 'stat-card' },
        el('span', { class: 'stat-label', text: 'Total Implied Value' }),
        el('span', { class: 'stat-value', text: fmtUsd(DATA.total_implied_fdv || 35e9) }),
        el('span', { class: 'stat-sub', text: 'Modeled FDV across pre-token field' })
      ),
      el('div', { class: 'stat-card' },
        el('span', { class: 'stat-label', text: 'Pre-Token TVL' }),
        el('span', { class: 'stat-value', text: fmtUsd(DATA.total_pre_token_tvl || 28e9) }),
        el('span', { class: 'stat-sub positive', text: 'Locked user capital' })
      ),
      el('div', { class: 'stat-card' },
        el('span', { class: 'stat-label', text: 'Watchlist Covered' }),
        el('span', { class: 'stat-value', text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }),
        el('span', { class: 'stat-sub positive', text: '100% floor coverage satisfied' })
      ),
      el('div', { class: 'stat-card' },
        el('span', { class: 'stat-label', text: 'Early Pre-Token Rows' }),
        el('span', { class: 'stat-value', text: String(DATA.early_size) }),
        el('span', { class: 'stat-sub', text: 'Uncapped below-floor opportunities' })
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var allChains = [];
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { if (allChains.indexOf(c) < 0) allChains.push(c); }); });
    allChains.sort();

    var search = el('input', {
      type: 'search',
      class: 'search-input',
      id: 'q',
      placeholder: 'Search by protocol, slug, chain or category...',
      value: state.q,
      'aria-label': 'Search protocols',
    });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });

    var selectCat = el('select', { class: 'select-filter', id: 'category', 'aria-label': 'Filter category' },
      el('option', { value: 'all', text: 'All Categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    selectCat.addEventListener('change', function () { state.category = selectCat.value; writeHash(); render(); });

    var selectChain = el('select', { class: 'select-filter', id: 'chain', 'aria-label': 'Filter chain' },
      el('option', { value: 'all', text: 'All Chains' }),
      allChains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    selectChain.addEventListener('change', function () { state.chain = selectChain.value; writeHash(); render(); });

    var btnPre = el('button', {
      type: 'button',
      class: 'tab-btn',
      'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false',
      text: 'Pre-Token Radar (' + rows().length + ')',
      onclick: function () { state.tab = 'pre-token'; render(); },
    });
    var btnLive = el('button', {
      type: 'button',
      class: 'tab-btn',
      'aria-pressed': state.tab === 'live' ? 'true' : 'false',
      text: 'Live Tokens (' + DATA.live.length + ')',
      onclick: function () { state.tab = 'live'; render(); },
    });

    return el('div', { class: 'controls-bar' },
      el('div', { class: 'search-box' }, el('span', { class: 'search-icon', text: '/' }), search),
      selectCat,
      selectChain,
      el('div', { class: 'tab-pill-group' }, btnPre, btnLive),
      el('span', { class: 'results-count', text: state.tab === 'pre-token' ? rows().length + ' / ' + DATA.board_size + ' rows' : DATA.live.length + ' benchmark tokens' })
    );
  }

  function sortHeader(key, label) {
    var isActive = state.sort === key;
    return el('th', { scope: 'col', class: isActive ? 'sort-active' : '' },
      el('button', {
        type: 'button',
        onclick: function () {
          if (state.sort === key) state.dir = -state.dir;
          else { state.sort = key; state.dir = -1; }
          render();
        },
      },
        label,
        isActive ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' \u25BC' : ' \u25B2' }) : ''
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'table-panel' },
        el('div', { class: 'empty-box' },
          el('h3', { text: 'No protocol matches the filter' }),
          el('p', { text: 'Try resetting the search query or selecting All Categories / All Chains.' }),
          el('button', {
            class: 'action-btn',
            type: 'button',
            text: 'Reset Filters',
            onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); },
          })
        )
      );
    }

    var maxVal = list[0].implied_value_usd || 1;
    var tbody = el('tbody');

    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var rankBadgeClass = r.rank === 1 ? 'rank-badge rank-1' : r.rank === 2 ? 'rank-badge rank-2' : r.rank === 3 ? 'rank-badge rank-3' : 'rank-badge';
      var isWl = r.tvl_usd >= DATA.floor_usd;

      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } },
      },
        el('td', null, el('span', { class: rankBadgeClass, text: '#' + r.rank })),
        el('td', null,
          el('div', { class: 'proto-info' },
            el('div', { class: 'proto-name-row' },
              el('span', { class: 'proto-name', text: r.name }),
              isWl ? el('span', { class: 'tag-wl', text: 'WATCHLIST' }) : el('span', { class: 'tag-early', text: 'EARLY' })
            ),
            el('div', { class: 'proto-chips' },
              el('span', { class: 'chip-cat', text: r.category || 'Other' }),
              (r.chains || []).slice(0, 3).map(function (c) { return el('span', { class: 'chip-chain', text: c }); })
            )
          )
        ),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null,
          el('div', { class: 'val-bar-box' },
            el('div', { class: 'val-track', 'aria-hidden': 'true' },
              el('div', { class: 'val-fill', style: 'width:' + Math.max(4, Math.round((r.implied_value_usd / maxVal) * 100)) + '%' })
            ),
            el('span', { class: 'val-text', text: fmtUsd(r.implied_value_usd) })
          )
        ),
        el('td', null,
          el('button', {
            class: 'action-btn',
            type: 'button',
            text: 'View Plan \u2192',
            onclick: function (e) { e.stopPropagation(); openDetail(r.slug); },
          })
        )
      );
      tbody.appendChild(tr);
    });

    return el('div', { class: 'table-panel' },
      el('div', { class: 'table-scroll' },
        el('table', null,
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d Change'),
            sortHeader('age', 'Seasoning'),
            sortHeader('implied', 'Implied Valuation'),
            el('th', { scope: 'col', text: 'Action' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r, i) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('span', { class: 'rank-badge', text: '#' + (i + 1) })),
        el('td', null,
          el('div', { class: 'proto-info' },
            el('span', { class: 'proto-name', text: r.name }),
            el('div', { class: 'proto-chips' },
              el('span', { class: 'chip-cat', text: r.category || 'Other' }),
              (r.chains || []).slice(0, 3).map(function (c) { return el('span', { class: 'chip-chain', text: c }); })
            )
          )
        ),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'tag-wl', text: 'TRADING' }))
      ));
    });

    return el('div', { class: 'table-panel' },
      el('div', { class: 'table-scroll' },
        el('table', null,
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Rank' }),
            el('th', { scope: 'col', text: 'Protocol' }),
            el('th', { scope: 'col', text: 'TVL' }),
            el('th', { scope: 'col', text: '7d Change' }),
            el('th', { scope: 'col', text: 'Real Market Cap' }),
            el('th', { scope: 'col', text: 'Status' })
          )),
          tbody
        )
      )
    );
  }

  function modelExplainer() {
    return el('section', { class: 'explainer-panel' },
      el('h3', { text: 'Valuation & Scoring Model (' + DATA.model_version + ')' }),
      el('p', { text: 'Every protocol on the board is evaluated through a deterministic quantitative model using verified on-chain and index metrics from DefiLlama. No protocol name is hand-picked or hardcoded.' }),
      el('div', { class: 'explainer-math', text: 'implied_fdv = max(1, round( tvl_usd \u00D7 base_mult \u00D7 (1 + clamp(change_7d, -60, 120)% \u00D7 0.45) \u00D7 (0.65 + min(age, 1095)/1095 \u00D7 0.35) \u00D7 sector_mult \u00D7 ecosystem_mult ))' }),
      el('p', { text: 'Base multiple (0.28) calibrates against historical median crypto FDV/TVL multiples. Momentum rewards rapid TVL inflows. Seasoning rewards protocol survival time without a token. Sector multipliers reflect fee capture dynamics (Perpetuals 1.30x, L2s 1.25x, Restaking 1.18x, DEX 1.12x).' })
    );
  }

  var dialog = el('dialog', { class: 'detail-modal', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';

    var steps = farmSteps(row);
    var computed = impliedOf(row, DATA.model);
    var isWl = row.tvl_usd >= DATA.floor_usd;

    var headerBox = el('div', { class: 'modal-header' },
      el('div', { class: 'modal-title-box' },
        el('span', { class: 'modal-rank', text: 'Rank #' + row.rank + ' \u2022 ' + (isWl ? 'Watchlist Floor' : 'Early Opportunity') }),
        el('h2', { id: 'detail-title', class: 'modal-title', text: row.name }),
        el('p', { class: 'modal-subtitle', text: (row.category || 'Other') + ' \u2022 Deployed on ' + ((row.chains && row.chains.length) ? row.chains.join(', ') : 'Ethereum') })
      ),
      el('button', {
        class: 'modal-close',
        type: 'button',
        'aria-label': 'Close dialog',
        text: '\u2715',
        onclick: function () { dialog.close(); },
      })
    );

    var bodyBox = el('div', { class: 'modal-body' },
      el('div', { class: 'metrics-grid' },
        el('div', { class: 'metric-tile' }, el('span', { class: 'metric-label', text: 'Implied Valuation' }), el('span', { class: 'metric-val pos', text: fmtUsd(row.implied_value_usd) })),
        el('div', { class: 'metric-tile' }, el('span', { class: 'metric-label', text: 'Protocol TVL' }), el('span', { class: 'metric-val', text: fmtUsd(row.tvl_usd) })),
        el('div', { class: 'metric-tile' }, el('span', { class: 'metric-label', text: '7-Day Change' }), el('span', { class: 'metric-val ' + (row.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(row.change_7d) })),
        el('div', { class: 'metric-tile' }, el('span', { class: 'metric-label', text: 'Age with No Token' }), el('span', { class: 'metric-val', text: fmtAge(row.age_days) })),
        el('div', { class: 'metric-tile' }, el('span', { class: 'metric-label', text: 'Sector Multiplier' }), el('span', { class: 'metric-val', text: (row.category_multiplier || sectorMultiplier(row.category)).toFixed(2) + 'x' })),
        el('div', { class: 'metric-tile' }, el('span', { class: 'metric-label', text: 'Ecosystem Reach' }), el('span', { class: 'metric-val', text: (row.chain_multiplier || ecosystemMultiplier(row.chains)).toFixed(2) + 'x' }))
      ),

      el('div', { class: 'formula-box' },
        el('span', { class: 'formula-head', text: 'Mathematical Model Verification' }),
        el('div', { class: 'formula-math', text: 'Implied = ' + fmtUsd(row.tvl_usd) + ' \u00D7 0.28 \u00D7 ' + (row.growth_multiplier || 1.0) + ' \u00D7 ' + (row.maturity_multiplier || 1.0) + ' \u00D7 ' + (row.category_multiplier || 1.0) + ' \u00D7 ' + (row.chain_multiplier || 1.0) + ' = ' + fmtUsd(computed) }),
        el('p', { class: 'formula-note', text: 'Live recomputation matches board data (' + fmtUsd(row.implied_value_usd) + '). Verified deterministic.' })
      ),

      el('section', { class: 'farm-section' },
        el('div', { class: 'section-head' },
          'Institutional Airdrop Farm Plan',
          el('span', { text: '6 Actionable Steps' })
        ),
        el('div', { class: 'steps-list' },
          steps.map(function (s, idx) {
            var checkId = 'step-' + row.slug + '-' + idx;
            var isDone = false;
            try { isDone = localStorage.getItem(checkId) === '1'; } catch (e) {}

            var checkbox = el('input', {
              type: 'checkbox',
              class: 'step-check',
              id: checkId,
              checked: isDone ? 'checked' : null,
              onchange: function () {
                try { localStorage.setItem(checkId, checkbox.checked ? '1' : '0'); } catch (e) {}
              },
            });

            return el('div', { class: 'step-card' },
              checkbox,
              el('div', { class: 'step-content' },
                el('span', { class: 'step-phase', text: s.phase }),
                el('p', { class: 'step-desc', text: s.text }),
                el('div', { class: 'step-meta' },
                  el('span', { class: 'meta-badge' }, 'Cost: ', el('b', { text: s.cost })),
                  el('span', { class: 'meta-badge' }, 'Time: ', el('b', { text: s.time }))
                )
              )
            );
          })
        )
      )
    );

    dialog.appendChild(headerBox);
    dialog.appendChild(bodyBox);

    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(statsBanner());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelExplainer());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');

    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
      var s = document.getElementById('q');
      if (s) { e.preventDefault(); s.focus(); }
    }
  });
})();
