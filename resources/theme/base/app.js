document.querySelectorAll('a[href^="http"]').forEach((link) => {
  link.rel = 'noopener noreferrer'
})

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches // Test edit

// Light / dark theme. Dark is the default (no attribute); the head script has
// already applied any saved choice before first paint, so here we only reflect
// state into the toggles and persist changes.
const root = document.documentElement
const toggles = document.querySelectorAll('.theme-toggle')
const paintToggles = () => {
  const light = root.dataset.theme === 'light'
  for (const button of toggles) {
    button.textContent = light ? '☀️' : '🌙'
    button.setAttribute('aria-pressed', String(light))
  }
}
paintToggles()
for (const button of toggles) {
  button.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light'
    try { localStorage.setItem('site-theme', root.dataset.theme) } catch (error) { /* private mode */ }
    paintToggles()
  })
}

// Faceted collections are static HTML with declarative item metadata. A page
// chooses its own facet names; this one controller works for questions, videos,
// books, resources, or any other collection body the Markdown renderer accepts.
document.querySelectorAll('[data-collection]').forEach((collection) => {
  const form = collection.querySelector('[data-collection-filters]')
  const items = [...collection.querySelectorAll('.collection-item')]
  const output = form?.querySelector('output')
  if (!form || !items.length || !output) return
  const facets = JSON.parse(collection.dataset.facetNames || '[]')
  const controls = new Map(facets.map((facet) => [facet, form.elements.namedItem(facet)]))
  const search = form.elements.namedItem('q')

  const readUrl = () => {
    const params = new URLSearchParams(location.search)
    if (search) search.value = params.get('q') || ''
    for (const [facet, control] of controls) {
      if (control) control.value = params.get(facet) || ''
    }
  }
  const writeUrl = () => {
    const url = new URL(location.href)
    for (const name of ['q', ...facets]) {
      const control = form.elements.namedItem(name)
      const value = control?.value.trim() || ''
      if (value) url.searchParams.set(name, value)
      else url.searchParams.delete(name)
    }
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }
  const paint = () => {
    const query = search?.value.trim().toLocaleLowerCase() || ''
    let shown = 0
    for (const item of items) {
      const values = JSON.parse(item.dataset.facets || '{}')
      const matchesFacets = [...controls].every(([facet, control]) => {
        const selected = control?.value || ''
        return !selected || (values[facet] || []).includes(selected)
      })
      const matchesSearch = !query || item.textContent.toLocaleLowerCase().includes(query)
      item.hidden = !(matchesFacets && matchesSearch)
      if (!item.hidden) shown += 1
    }
    // Group headings are ordinary h2 elements between collection items. Hide a
    // heading when filtering leaves no visible item before the next heading.
    for (const heading of collection.querySelectorAll('.collection-body > h2')) {
      const groupContent = []
      let sibling = heading.nextElementSibling
      let hasVisibleItem = false
      while (sibling && sibling.tagName !== 'H2') {
        groupContent.push(sibling)
        if (sibling.classList.contains('collection-item') && !sibling.hidden) hasVisibleItem = true
        sibling = sibling.nextElementSibling
      }
      heading.hidden = !hasVisibleItem
      // A group's explanatory paragraphs, source links, and other interstitial
      // Markdown are siblings of its items. They belong to the group too, so do
      // not leave them behind when every item in that group is filtered out.
      for (const element of groupContent) {
        if (!element.classList.contains('collection-item')) element.hidden = !hasVisibleItem
      }
    }
    output.textContent = `Showing ${shown} of ${items.length} items`
  }
  const update = () => { writeUrl(); paint() }
  form.addEventListener('input', update)
  form.addEventListener('change', update)
  form.addEventListener('reset', () => setTimeout(update))
  addEventListener('popstate', () => { readUrl(); paint() })
  readUrl()
  paint()
})

// Stacked decks: a loose pile of cards that fans out into the normal grid on
// the first click. While piled, clicking spreads (rather than flipping the top
// card) and the inner cards stay out of the tab order.
document.querySelectorAll('.card-group.stacked').forEach((group) => {
  const pile = group.querySelector('.pile')
  // A shuffled group reorders its cards on every load, so a fresh handful rests
  // on top of the table each refresh. The last few in DOM order are the ones
  // painted on top (the stylesheet hides the rest until the group is opened).
  if (pile && group.hasAttribute('data-shuffle')) {
    const order = [...pile.children]
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    for (const card of order) pile.appendChild(card)
  }
  const cards = group.querySelectorAll('.flip')
  cards.forEach((card, index) => {
    card.setAttribute('tabindex', '-1')
    card.style.setProperty('--i', String(index))
  })
  const spread = () => {
    if (!group.classList.contains('stacked')) return
    if (group.dataset.href) { window.location.href = group.dataset.href; return }
    group.classList.remove('stacked')
    group.classList.add('spread')
    group.removeAttribute('role')
    group.removeAttribute('tabindex')
    group.setAttribute('aria-expanded', 'true')
    cards.forEach((card) => card.setAttribute('tabindex', '0'))
  }
  // Capture so the spread beats the per-card flip handler and swallows the click.
  group.addEventListener('click', (event) => {
    if (!group.classList.contains('stacked')) return
    event.stopPropagation()
    event.preventDefault()
    spread()
  }, true)
  group.addEventListener('keydown', (event) => {
    if (group.classList.contains('stacked') && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      spread()
    }
  })
})
// Cluster shelves: the stylesheet caps each shelf at one full row of cards and
// hides the button when the cluster already fits that row, so all this does is
// flip a class. No measurement, no column counting — which width shows how many
// cards is a CSS question, and asking it here would just be a second, drifting
// answer to it.
document.querySelectorAll('.shelf').forEach((shelf) => {
  const button = shelf.querySelector('.shelf-more')
  const rail = shelf.querySelector('.shelf-rail')
  if (!button || !rail) return
  const cards = rail.querySelectorAll('.flip')
  // Stagger index for the deal-in animation, same as the fan-out decks use.
  cards.forEach((card, index) => card.style.setProperty('--i', String(index)))
  button.addEventListener('click', () => {
    const open = shelf.classList.toggle('open')
    button.setAttribute('aria-expanded', String(open))
    button.textContent = open ? 'Show fewer ↑' : `See all ${cards.length} →`
  })
})

const sky = document.querySelector('#sky')
if (sky) {
  const hues = ['#3aa99f', '#d0a215', '#ce5d97', '#4385be']
  const layers = [
    { count: 80, size: 1.2, speed: .05, className: 'l1' },
    { count: 40, size: 1.6, speed: .11, className: 'l2' },
    { count: 20, size: 2.2, speed: .2, className: 'l3' },
  ].map((config) => {
    const element = document.createElement('div')
    element.className = `stars ${config.className}`
    sky.appendChild(element)
    return { ...config, element }
  })
  const seed = () => {
    const width = innerWidth
    const height = innerHeight * 1.6
    for (const layer of layers) {
      const shadows = []
      for (let index = 0; index < layer.count; index += 1) {
        const color = Math.random() < .09 ? hues[(Math.random() * hues.length) | 0] : '#fffcf0'
        const opacity = (.15 + Math.random() * .35).toFixed(2)
        shadows.push(`${(Math.random() * width) | 0}px ${(Math.random() * height) | 0}px 0 ${color}`)
        shadows.push(`${(Math.random() * width) | 0}px ${(Math.random() * height) | 0}px 0 rgba(255,252,240,${opacity})`)
      }
      layer.element.style.width = layer.element.style.height = `${layer.size}px`
      layer.element.style.boxShadow = shadows.join(',')
    }
  }
  seed()
  addEventListener('resize', seed)
  if (!reducedMotion) {
    addEventListener('scroll', () => {
      for (const layer of layers) layer.element.style.transform = `translateY(${-scrollY * layer.speed}px)`
    }, { passive: true })
  }
}

// Activity strips arrive as weekly totals with an empty frame around them,
// because a reading taken at build time is wrong by the next morning and stays
// wrong until someone rebuilds. Taking it here means a page untouched for a
// month still answers against today.
//
// The markup already holds the one durable fact — the absolute date of the last
// change — so a failure to reach this point degrades to a true, if quieter,
// strip rather than a stale one. Same reason weeks outside the window are
// dropped rather than clamped into the oldest bar: a site left alone past the
// whole window keeps its date and simply stops claiming a count.
const DAY_MS = 24 * 60 * 60 * 1000
// Counted in whole days rather than elapsed milliseconds, because that is the
// unit the page actually carries. Reading a day-resolution stamp as a moment
// would put every change at midnight and quietly age it by up to a day — a
// change made yesterday evening would come back as "2 days ago". Whole days
// subtracted from whole days is both the honest reading and the one a person
// means by "yesterday".
const relativeDay = (days) => {
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.round(days / 7)} weeks ago`
  return `${Math.round(days / 30)} months ago`
}
document.querySelectorAll('.activity[data-activity]').forEach((strip) => {
  const span = Number(strip.dataset.weeks) || 12
  // `<week since epoch>:<changes>` — weekly totals, because the publisher
  // aggregates on the way out so a page never carries the hour, or even the
  // day, a member happened to be working. The week numbers are absolute, so
  // working out how far back each one sits is this side's job.
  const today = Math.floor(Date.now() / DAY_MS)
  const thisWeek = Math.floor((today + 3) / 7)
  const weeks = Array.from({ length: span }, () => 0)
  for (const pair of strip.dataset.activity.split(',')) {
    const [week, count] = pair.split(':').map(Number)
    const index = span - 1 - (thisWeek - week)
    if (Number.isFinite(count) && index >= 0 && index < span) weeks[index] += count
  }
  const changes = weeks.reduce((total, week) => total + week, 0)
  if (!changes) return
  const peak = Math.max(...weeks)
  const noun = changes === 1 ? 'change' : 'changes'

  const count = document.createElement('span')
  count.className = 'activity-fact'
  const total = document.createElement('b')
  total.textContent = String(changes)
  count.append(total, ` ${noun} in ${span} weeks`)

  // A week with no changes is flat — the CSS min-height leaves a baseline tick so
  // the run of weeks stays readable. The 8% floor lifts only weeks that did have
  // a change, so a single change against a busy peak is still visible rather than
  // rounding away to nothing; applying it to empty weeks too would draw activity
  // where there was none.
  const spark = document.createElement('span')
  spark.className = 'activity-spark'
  spark.setAttribute('role', 'img')
  spark.setAttribute('aria-label', `${changes} ${noun} over the last ${span} weeks`)
  for (const week of weeks) {
    const bar = document.createElement('span')
    bar.style.setProperty('--h', `${week ? Math.max(8, Math.round((week / peak) * 100)) : 0}%`)
    spark.appendChild(bar)
  }

  const lastWeek = strip.dataset.activity.split(',')
    .map((pair) => Number(pair.split(':')[0]))
    .filter(Number.isFinite)
    .reduce((latest, week) => Math.max(latest, week), -Infinity)
  const lastLabel = strip.querySelector('.activity-last')
  if (lastLabel && Number.isFinite(lastWeek)) {
    const age = thisWeek - lastWeek
    lastLabel.textContent = age <= 0 ? 'updated this week' : age <= 4 ? 'updated this month' : 'updated earlier'
  }
  strip.prepend(count, spark)
})

// The proposed-project gallery is deliberately a native horizontal scroller,
// not a duplicated marquee. It moves calmly until a reader hovers, focuses, or
// touches it; touch then owns the rail for a moment after release. Filtering and
// shuffling work only on the real cards, so there are never duplicate links or
// focus targets hidden in a looping animation.
document.querySelectorAll('[data-proposed-carousel]').forEach((gallery) => {
  const viewport = gallery.querySelector('.carousel-viewport')
  const rail = gallery.querySelector('.carousel-rail')
  const chips = [...gallery.querySelectorAll('.carousel-chip')]
  const status = gallery.querySelector('.carousel-status')
  const reset = gallery.querySelector('.carousel-reset')
  const previous = gallery.querySelector('.carousel-prev')
  const next = gallery.querySelector('.carousel-next')
  const toggle = gallery.querySelector('.carousel-toggle')
  const shuffle = gallery.querySelector('.carousel-shuffle')
  if (!viewport || !rail || !chips.length) return

  let selected = new Set(chips.map((chip) => chip.dataset.cluster))
  let direction = 1
  // This is a user-controlled gallery, so it must start moving even when the
  // operating system asks CSS animations to reduce motion. The pause control
  // remains the explicit opt-out for this content.
  let manualPause = false
  let hoverPause = false
  let heldUntil = 0
  let boostEnd = 0  // time when the step boost expires

  const items = () => [...rail.querySelectorAll('.carousel-item')]
  const paint = () => {
    const all = selected.size === chips.length
    let shown = 0
    for (const item of items()) {
      const visible = selected.has(item.dataset.cluster)
      item.hidden = !visible
      if (visible) shown += 1
    }
    for (const chip of chips) {
      const on = selected.has(chip.dataset.cluster)
      chip.classList.toggle('on', on)
      chip.setAttribute('aria-pressed', String(on))
    }
    reset.hidden = all
    const random = gallery.querySelector('.carousel-random')
    random.hidden = !all
    status.textContent = all ? `Showing all ${shown} proposed projects` : `Showing ${shown} proposed projects`
    viewport.scrollLeft = 0
    direction = 1
  }
  const paintToggle = () => {
    if (!toggle) return
    const paused = manualPause || hoverPause
    toggle.textContent = paused ? '▶' : '⏸'
    toggle.setAttribute('aria-label', paused ? 'Resume scrolling' : 'Pause scrolling')
    toggle.setAttribute('aria-pressed', String(paused))
  }
  const step = (sign) => {
    const maximum = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
    // When stopped (manualPause), check if the clicked direction has space.
    if (manualPause) {
      if (sign > 0 && viewport.scrollLeft >= maximum) {
        // At right end — do nothing.
        return
      }
      if (sign < 0 && viewport.scrollLeft <= 0) {
        // At left end — do nothing.
        return
      }
      // Has space — resume in the clicked direction.
      direction = sign
      boostEnd = Date.now() + 500
      manualPause = false
      paintToggle()
      return
    }
    // Not stopped — normal step.
    boostEnd = Date.now() + 500
    direction = sign
  }
  const reshuffle = () => {
    const order = items()
    const first = order[0]
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    if (order.length > 1 && order[0] === first) [order[0], order[1]] = [order[1], order[0]]
    for (const item of order) rail.appendChild(item)
    order.forEach((item, index) => item.style.setProperty('--i', String(index)))
    rail.classList.remove('is-shuffling')
    // Reflow before adding the animation class so the deal-in is observable
    // even when the rail was already at scrollLeft 0.
    void rail.offsetWidth
    rail.classList.add('is-shuffling')
    setTimeout(() => rail.classList.remove('is-shuffling'), 700)
    viewport.scrollLeft = 0
    direction = 1
  }
  for (const chip of chips) chip.addEventListener('click', () => {
    const id = chip.dataset.cluster
    if (selected.has(id)) {
      // Don't allow deselecting the last chip — ignore the action.
      if (selected.size === 1) return
      selected.delete(id)
    } else {
      selected.add(id)
    }
    paint()
  })
  reset?.addEventListener('click', () => {
    if (manualPause) {
      manualPause = false
      paintToggle()
    }
    selected = new Set(chips.map((chip) => chip.dataset.cluster))
    paint()
  })
  const random = gallery.querySelector('.carousel-random')
  random?.addEventListener('click', () => {
    if (selected.size === chips.length) {
      if (manualPause) {
        manualPause = false
        paintToggle()
      }
      const pick = chips[Math.floor(Math.random() * chips.length)]
      selected = new Set([pick.dataset.cluster])
      paint()
    }
  })
  previous?.addEventListener('click', () => step(-1))
  next?.addEventListener('click', () => step(1))
  toggle?.addEventListener('click', () => {
    manualPause = !manualPause
    if (!manualPause) {
      // Resume in the direction where there's more space.
      const maximum = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
      const spaceRight = maximum - viewport.scrollLeft
      const spaceLeft = viewport.scrollLeft
      direction = spaceRight > spaceLeft ? 1 : -1
    }
    paintToggle()
  })
  shuffle?.addEventListener('click', () => {
    if (manualPause) {
      manualPause = false
      paintToggle()
    }
    reshuffle()
  })
  viewport.addEventListener('pointerdown', (event) => {
    heldUntil = performance.now() + 3600
    if (event.pointerType !== 'mouse') {
      manualPause = true
      paintToggle()
    }
  })
  viewport.addEventListener('pointerup', () => { heldUntil = performance.now() + 3600 })
  viewport.addEventListener('pointercancel', () => { heldUntil = performance.now() + 3600 })

  // Hover pause: separate flag so it doesn't override the explicit toggle.
  viewport.addEventListener('mouseenter', () => {
    hoverPause = true
    paintToggle()
  })
  viewport.addEventListener('mouseleave', () => {
    hoverPause = false
    paintToggle()
  })

  let lastFrame = performance.now()

  const tick = () => {
    const elapsed = Math.min(performance.now() - lastFrame, 50)
    lastFrame = performance.now()
    const resting = manualPause || hoverPause || heldUntil > Date.now()
    const maximum = viewport.scrollWidth - viewport.clientWidth

    if (!resting && maximum > 1) {
      // During a step boost, move 5x faster so the next card arrives smoothly.
      const speed = boostEnd > Date.now() ? 1 : 0.05
      viewport.scrollLeft += elapsed * speed * direction
      // Clamp to boundary — stop naturally.
      if (viewport.scrollLeft >= maximum) {
        viewport.scrollLeft = maximum
        manualPause = true
        paintToggle()
      } else if (viewport.scrollLeft <= 0) {
        viewport.scrollLeft = 0
        manualPause = true
        paintToggle()
      }
    }
    requestAnimationFrame(tick)
  }

  paint()
  reshuffle()
  paintToggle()
  requestAnimationFrame(tick)
})

document.querySelectorAll('.flip:not(.static)').forEach((card) => {
  const toggle = () => {
    card.classList.toggle('on')
    card.setAttribute('aria-pressed', String(card.classList.contains('on')))
  }
  card.addEventListener('click', (event) => {
    if (event.target.closest('a, button')) return
    toggle()
  })
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggle()
    }
  })
})
