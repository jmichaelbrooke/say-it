// Word prediction for the typing box. Learns from what he says and types,
// and falls back to a list of common conversational English words.
(function (root) {
  'use strict';

  // Roughly most-common first. His own words always outrank these.
  var BASE = ('i you the to a and it is that of in what for yes no not do have be this my me we can your on ' +
    'with at are was just so but like get go know will if all about there one please thank thanks would ' +
    'how out up want need when now here time good okay ok going think see come some then him her they them ' +
    'right back well could who did said got make more tell take from home work day today tomorrow yesterday ' +
    'night morning afternoon evening later soon again help call phone number name where why which much many ' +
    'little lot very really sure maybe sorry hello hi bye love nice great fine bad better best hurts hurt pain ' +
    'doctor nurse hospital appointment medicine pills water coffee tea food eat drink hungry thirsty tired ' +
    'sleep bed bathroom shower cold hot warm weather rain snow wind sun outside inside house car truck drive ' +
    'ride trail desert gas fuel tire tires pressure oil battery broke broken fix fixed tools store buy pay ' +
    'money cash card price cost how much cheap expensive open close closed door window light turn off down ' +
    'left right straight stop wait slow fast hurry careful look watch listen hear speak say write read ' +
    'understand repeat again slowly louder quiet noise tv television radio news weather game music computer ' +
    'internet wifi starlink email text message picture photo send forum friend friends family wife son ' +
    'daughter brother sister kids grandkids dog cat neighbor church meeting dinner lunch breakfast supper ' +
    'feeding tube bag formula pump clean change feel feeling sick better worse okay alright fine great ' +
    'let us lets let\'s i\'m i\'ll i\'ve don\'t can\'t won\'t didn\'t isn\'t it\'s that\'s what\'s where\'s ' +
    'you\'re we\'re they\'re there\'s should shouldn\'t has had does done any anything something nothing ' +
    'everything someone anyone everyone first last next week month year monday tuesday wednesday thursday ' +
    'friday saturday sunday hour hours minute minutes o\'clock am pm early late ready finished start ' +
    'still also too only even never always sometimes usually often other another same new old big small ' +
    'long short more less enough over under near far away after before because while until since into ' +
    'than then these those our us his their its an as by or were been being also give put keep find ' +
    'try use show bring leave meet move remember forget mean need needs wants likes happy sad mad worried ' +
    'afraid surprised interesting funny ha yeah yep nope hey sir ma\'am mr mrs dr thing things stuff place ' +
    'way people man woman guy kid life job city town road street mile miles gallon map gps route camp ' +
    'camping mountain river lake trip vacation plane flight airport hotel room key keys wallet glasses ' +
    'hearing aid shoes jacket coat hat gloves blanket pillow chair table kitchen garage yard garden grass ' +
    'weekend holiday birthday christmas thanksgiving party gift').split(/\s+/);

  // Craig's world: side-by-sides, RV life on BLM land, the desert Southwest.
  var OUTDOORS = ('sxs side-by-side utv atv rzr polaris can-am maverick talon teryx yamaha honda ' +
    'rv camper trailer fifth-wheel generator solar panel panels inverter batteries propane tank tanks ' +
    'fresh gray black dump station hookup hookups boondocking blm dispersed campsite campground permit ' +
    'ranger moab utah colorado new mexico arizona four corners durango ouray silverton telluride ' +
    'grand junction montrose farmington gallup taos st george kanab hanksville green river san juan ' +
    'canyon canyons mesa butte arroyo wash slickrock sand dunes gravel dirt washboard switchback pass ' +
    'trailhead trails winch recovery strap tow hitch skid plate shocks suspension axle cv flat spare ' +
    'plug compressor air down psi helmet goggles dust gmrs channel garmin inreach waypoint coordinates ' +
    'elevation signal service jerry can diesel cooler ice groceries jug spring creek monsoon flash flood ' +
    'lightning storm heat shade sunscreen rattlesnake scorpion coyote elk deer cattle guard gate ranch ' +
    'ghost town petroglyphs ruins arches canyonlands navajo reservation hiking sunset sunrise stars ' +
    'firewood campfire leveling blocks awning slide-out').split(/\s+/);

  var SPECIAL = { sxs: 'SxS', utv: 'UTV', atv: 'ATV', rzr: 'RZR', rv: 'RV', blm: 'BLM', gmrs: 'GMRS', psi: 'PSI',
    cv: 'CV', 'can-am': 'Can-Am', inreach: 'inReach', tv: 'TV', gps: 'GPS', wifi: 'Wi-Fi', mr: 'Mr', mrs: 'Mrs', dr: 'Dr',
    am: 'AM', pm: 'PM', i: 'I', "i'm": "I'm", "i'll": "I'll", "i've": "I've", "ma'am": "ma'am" };
  ('polaris maverick talon teryx yamaha honda moab utah colorado mexico arizona durango ouray silverton telluride ' +
   'junction montrose farmington gallup taos george kanab hanksville juan navajo canyonlands garmin starlink michael ' +
   'monday tuesday wednesday thursday friday saturday sunday christmas thanksgiving').split(' ').forEach(function (w) {
    SPECIAL[w] = w.charAt(0).toUpperCase() + w.slice(1);
  });
  function display(w) { return SPECIAL[w] || w; }

  var WORD_RE = /[a-z0-9'-]+/g;
  function words(text) { return (String(text).toLowerCase().match(WORD_RE) || []); }

  function create() {
    var uni = Object.create(null), bi = Object.create(null), sentences = [];
    BASE.forEach(function (w, i) { if (!(w in uni)) uni[w] = { base: 1 / (1 + i * 0.05), mine: 0 }; });
    OUTDOORS.forEach(function (w) { if (!(w in uni)) uni[w] = { base: 0.12, mine: 0 }; });

    function learnWords(text, weight) {
      var ws = words(text), prev = '^';
      ws.forEach(function (w) {
        (uni[w] = uni[w] || { base: 0, mine: 0 }).mine += weight;
        var m = bi[prev] = bi[prev] || Object.create(null);
        m[w] = (m[w] || 0) + weight;
        prev = w;
      });
    }

    // history: [{text, count, last}]; phrases: [text]
    function rebuild(history, phrases) {
      Object.keys(uni).forEach(function (k) { uni[k].mine = 0; });
      bi = Object.create(null);
      (phrases || []).forEach(function (t) { learnWords(t, 0.5); });
      (history || []).forEach(function (h) { learnWords(h.text, 2 * Math.min(5, h.count || 1)); });
      sentences = (history || []).slice().sort(function (a, b) { return (b.last || 0) - (a.last || 0); });
    }

    // Split the box contents into the words before the cursor and the word being typed.
    function context(text) {
      var m = /([a-z0-9']*)$/i.exec(text);
      var partial = m ? m[1].toLowerCase() : '';
      var before = words(text.slice(0, text.length - partial.length));
      var endsSentence = /[.!?]\s*$/.test(text.slice(0, text.length - partial.length));
      return { partial: partial, prev: before.length && !endsSentence ? before[before.length - 1] : '^' };
    }

    function suggestWords(text, n) {
      n = n || 6;
      var c = context(text), next = bi[c.prev] || {}, scored = [];
      Object.keys(uni).forEach(function (w) {
        if (c.partial && (w.indexOf(c.partial) !== 0 || w === c.partial)) return;
        var u = uni[w], s = u.base + u.mine * 2 + (next[w] || 0) * 12;
        if (!c.partial && !next[w] && c.prev !== '^') s *= 0.3; // after a space, favour words that follow
        if (s > 0) scored.push([w, s]);
      });
      scored.sort(function (a, b) { return b[1] - a[1] || a[0].length - b[0].length; });
      return scored.slice(0, n).map(function (x) { return x[0]; });
    }

    // Whole sentences he has used before that start with what is typed.
    function suggestSentences(text, n) {
      n = n || 3;
      var t = String(text).toLowerCase().trim();
      return sentences.filter(function (h) {
        var s = h.text.toLowerCase();
        return !t ? true : s.indexOf(t) === 0 && s !== t;
      }).slice(0, n).map(function (h) { return h.text; });
    }

    // Replace the word being typed with the chosen word.
    function applyWord(text, word) {
      var c = context(text), base = text.slice(0, text.length - c.partial.length);
      if (base && !/\s$/.test(base)) base += ' ';
      var cap = !base.trim() || /[.!?]\s*$/.test(base);
      var shown = display(word);
      return base + (cap ? shown.charAt(0).toUpperCase() + shown.slice(1) : shown) + ' ';
    }

    return { rebuild: rebuild, suggestWords: suggestWords, suggestSentences: suggestSentences, applyWord: applyWord, display: display };
  }

  // Adds a spoken sentence to the history list (kept newest-first, capped).
  function remember(history, text, now) {
    text = String(text).trim().replace(/\s+/g, ' ');
    if (!text) return history;
    var key = text.toLowerCase(), found = null;
    history.forEach(function (h) { if (h.text.toLowerCase() === key) found = h; });
    if (found) { found.count = (found.count || 1) + 1; found.last = now; found.text = text; }
    else history.push({ text: text, count: 1, last: now });
    history.sort(function (a, b) { return b.last - a.last; });
    if (history.length > 400) history.length = 400;
    return history;
  }

  var api = { create: create, remember: remember, words: words };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WordPredict = api;
})(this);
