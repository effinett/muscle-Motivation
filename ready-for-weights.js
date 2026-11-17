/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — "Ready for weights?" card (Phase 4.3.9-L, owner-approved
 * 2026-11-17, revised the same day)
 *
 * Pure and shared: decides whether the Completion page shows the card and
 * what it offers. No DOM, fetch, DB or clock.
 *
 * The rules, exactly as approved:
 *   • Where: the Completion page of Bodyweight Foundations and Bodyweight Fat
 *     Loss only. Every other Program already uses weights.
 *   • When: once per workout, if any exercise in it reached the end of its
 *     path (BodyweightProgression status 'terminal', "No next step yet").
 *     One card, not one per exercise.
 *   • Main action: "Update my equipment". It opens the equipment answer in
 *     Profile; once the client saves, the normal recommendation ranking picks
 *     the Program. The card never chooses one for them.
 *   • Direct link, only where it is still correct: "See Home Strength" (from
 *     Bodyweight Foundations) or "See Home Fat Loss" (from Bodyweight Fat
 *     Loss), and ONLY when ALL of these hold:
 *       – that Program is in the published catalog (pcLoadCatalog reads only
 *         status = 'published', so an unmigrated Program is never there);
 *       – its catalog page_path is the shared Program page for that slug;
 *       – the normal ranking, run for this client's own profile with a
 *         home-setup equipment answer, picks that same Program.
 *     Otherwise the card offers only "Update my equipment". This module adds
 *     no ranking logic: the caller runs Personalization.derivePersonalizedStart
 *     on rankingProfile(profile) and passes the pick in.
 *   • It never enrols the client, changes their Program or equipment answer,
 *     starts a purchase or swaps an exercise.
 *
 * Browser: global `ReadyForWeights`.  Node: guarded module.exports.
 * ──────────────────────────────────────────────────────────────────────── */

(function (root) {
  'use strict';

  // Source Program → the one Program its direct link may ever name.
  var DIRECT_TARGET = Object.freeze({
    bodyweight_foundations: 'home_strength',
    bodyweight_fat_loss: 'home_fat_loss'
  });

  // The equipment answer the ranking is run with for the direct-link check:
  // "Home setup — some equipment" (profiles.gym_access).
  var RANKING_GYM_ACCESS = 'home_basic';

  // Where the main action goes: Profile's equipment-only editor.
  var EQUIPMENT_HREF = 'profile.html?edit=equipment';

  // Approved copy: the direct link adds what that Program uses.
  var EQUIPMENT_LINE = Object.freeze({
    home_strength: 'uses dumbbells and a long resistance band.',
    home_fat_loss: 'uses dumbbells, a long resistance band and a mini band.'
  });

  var TERMINAL = 'terminal';

  function appliesTo(programSlug) {
    return typeof programSlug === 'string' &&
      Object.prototype.hasOwnProperty.call(DIRECT_TARGET, programSlug);
  }

  // Names of the exercises at the end of their path, in workout order, once each.
  function terminalNames(items) {
    var out = [];
    (Array.isArray(items) ? items : []).forEach(function (it) {
      if (!it || it.status !== TERMINAL) return;
      var n = typeof it.name === 'string' ? it.name.trim() : '';
      if (n && out.indexOf(n) === -1) out.push(n);
    });
    return out;
  }

  function joinNames(names) {
    if (names.length <= 1) return names[0] || '';
    return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }

  // A COPY of the profile with the home-setup answer. The stored profile is
  // never changed; this only asks the ranking "what would you pick?".
  function rankingProfile(profile) {
    var p = (profile && typeof profile === 'object') ? profile : {};
    var copy = {};
    for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k)) copy[k] = p[k];
    copy.gym_access = RANKING_GYM_ACCESS;
    return copy;
  }

  /* directLink(sourceSlug, recommended, catalog, pagePathFor)
   *   recommended  plan.training.recommendedProgram from the ranking run on
   *                rankingProfile(profile), or null
   *   catalog      the published catalog (pcLoadCatalog)
   *   pagePathFor  ProgramPage.pagePathFor — the shared page's own path rule
   * → { slug, label, href, note } or null. Fails closed on any doubt. */
  function directLink(sourceSlug, recommended, catalog, pagePathFor) {
    var target = appliesTo(sourceSlug) ? DIRECT_TARGET[sourceSlug] : null;
    if (!target || typeof pagePathFor !== 'function') return null;
    if (!recommended || recommended.slug !== target) return null;

    var row = null;
    (Array.isArray(catalog) ? catalog : []).forEach(function (r) {
      if (r && r.slug === target) row = r;
    });
    if (!row || row.status !== 'published') return null;

    var expected = pagePathFor(target);
    if (!expected || row.pagePath !== expected || recommended.pagePath !== expected) return null;

    var name = (typeof row.name === 'string' && row.name.trim()) || null;
    if (!name) return null;
    return {
      slug: target,
      label: 'See ' + name,
      href: expected,
      note: name + ' ' + EQUIPMENT_LINE[target]
    };
  }

  /* buildCard(input)
   *   programSlug   the workout's program_slug
   *   exercises     [{ name, status }] — status from BodyweightProgression.decide
   *   recommended   see directLink
   *   catalog       see directLink
   *   pagePathFor   see directLink
   * → null (no card) or { title, body, primary: {label, href}, secondary } */
  function buildCard(input) {
    var i = input || {};
    if (!appliesTo(i.programSlug)) return null;
    var names = terminalNames(i.exercises);
    if (!names.length) return null;
    return {
      title: 'Ready for weights?',
      body: 'You’ve hit the top of the bodyweight version on ' + joinNames(names) + '. ' +
        'Adding load is the next step. Tell us what equipment you have and we’ll match you ' +
        'to the right Program.',
      primary: { label: 'Update my equipment', href: EQUIPMENT_HREF },
      secondary: directLink(i.programSlug, i.recommended, i.catalog, i.pagePathFor)
    };
  }

  /* equipmentMatch(plan, describeReasons)
   * What Profile's equipment sheet shows after the client saves: the normal
   * ranking's own pick for their real, updated profile. Presentation only.
   *   plan             Personalization.derivePersonalizedStart(profile, {catalog})
   *   describeReasons  Personalization.describeReasons (optional)
   * → { kind: 'match', name, href, reasons } — a published Program with a page
   *   { kind: 'no_fit' }                     — nothing suits that equipment
   *   { kind: 'unknown' }                    — catalog missing, or no page */
  function equipmentMatch(plan, describeReasons) {
    var t = plan && plan.training;
    var rec = t && t.recommendedProgram;
    if (rec && typeof rec.pagePath === 'string' && rec.pagePath && rec.name) {
      var reasons = [];
      try { if (typeof describeReasons === 'function') reasons = describeReasons(plan) || []; } catch (e) { reasons = []; }
      return { kind: 'match', name: rec.name, href: rec.pagePath, reasons: reasons };
    }
    if (t && t.noFitReason === 'equipment') return { kind: 'no_fit' };
    return { kind: 'unknown' };
  }

  var api = {
    DIRECT_TARGET: DIRECT_TARGET,
    RANKING_GYM_ACCESS: RANKING_GYM_ACCESS,
    EQUIPMENT_HREF: EQUIPMENT_HREF,
    appliesTo: appliesTo,
    terminalNames: terminalNames,
    rankingProfile: rankingProfile,
    directLink: directLink,
    buildCard: buildCard,
    equipmentMatch: equipmentMatch
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ReadyForWeights = api;
})(typeof window !== 'undefined' ? window : this);
