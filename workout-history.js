/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Workout History (shared)
 *
 * Single source of truth for rendering completed-workout history. Used by:
 *   - workout.html        (start-screen "Recent Workouts", limited to 10)
 *   - workout-history.html (full chronological list, all workouts)
 *
 * Depends on these globals provided by the host page:
 *   - supabaseClient   (supabase.js)
 *   - currentUser      ({ id })
 *   - showToast(msg)
 *   - programName(slug) + sessionLabel(key)  (schedules.js)
 *
 * The host page must contain an element matching opts.targetId (default
 * "historyList") and include the history-card CSS classes.
 * ────────────────────────────────────────────────────────────────────────── */

var workoutHistory  = [];
var _histTargetId   = 'historyList';
var _histEmptyText  = 'No workouts yet — start your first session above.';

function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* Load completed workouts (newest first) and render them.
 * opts: { limit, targetId, emptyText } — all optional. */
async function loadHistory(opts) {
  opts = opts || {};
  _histTargetId  = opts.targetId  || 'historyList';
  _histEmptyText = opts.emptyText || 'No workouts yet — start your first session above.';

  var query = supabaseClient
    .from('workouts')
    .select('id, name, notes, created_at, duration_minutes, program_slug, session_key, mode, workout_exercises(id, exercise_name, order_index, workout_sets(id, set_number, weight_lbs, reps, completed))')
    .eq('user_id', currentUser.id).eq('completed', true)
    .order('created_at', { ascending: false });
  if (opts.limit) query = query.limit(opts.limit);

  var { data } = await query;

  var el = document.getElementById(_histTargetId);
  if (!el) return;
  if (!data || data.length === 0) {
    el.innerHTML = '<div class="empty-state">' + _histEmptyText + '</div>';
    return;
  }
  workoutHistory = data.map(function(w) { return Object.assign({ _editing: false }, w); });
  renderHistory();
}

function renderHistory() {
  var el = document.getElementById(_histTargetId);
  if (!el) return;
  el.innerHTML = workoutHistory.map(function(w, idx) {
    var d = new Date(w.created_at);
    var date = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    var exs = (w.workout_exercises || []).slice().sort(function(a,b){ return (a.order_index||0)-(b.order_index||0); });
    var totalSets = exs.reduce(function(n, e) { return n + (e.workout_sets || []).length; }, 0);
    var doneSets  = exs.reduce(function(n, e) { return n + (e.workout_sets || []).filter(function(s) { return s.completed; }).length; }, 0);

    // Program + session sub-line (only when stored on the workout)
    var progName = (w.program_slug && typeof programName === 'function') ? programName(w.program_slug) : '';
    var sessName = (w.session_key  && typeof sessionLabel === 'function') ? sessionLabel(w.session_key)  : '';
    var subParts = [];
    if (progName) subParts.push(progName);
    if (sessName) subParts.push(sessName);
    // Mode tag (Progression / Optional) — only meaningful for program-linked
    // workouts, so skip it for plain manual sessions.
    if (w.program_slug && w.mode) {
      subParts.push(w.mode === 'progression' ? 'Progression' : 'Optional');
    }
    var subLine = subParts.length ? '<div class="history-sub">' + esc(subParts.join(' · ')) + '</div>' : '';

    var exListInner;
    if (w._editing) {
      var exEditRows = exs.map(function(e) {
        var sets = (e.workout_sets || []).slice().sort(function(a,b){ return (a.set_number||0)-(b.set_number||0); });
        var setInputs = sets.map(function(s) {
          return '<div class="hist-edit-set">' +
            '<span class="hist-set-num">' + (s.set_number || '') + '</span>' +
            '<input class="hist-set-in" type="number" min="0" max="9999" step="2.5" ' +
              'value="' + (s.weight_lbs != null ? s.weight_lbs : '') + '" placeholder="lbs" id="hs-w-' + s.id + '">' +
            '<span class="hist-x">×</span>' +
            '<input class="hist-set-in" type="number" min="0" max="999" step="1" ' +
              'value="' + (s.reps != null ? s.reps : '') + '" placeholder="reps" id="hs-r-' + s.id + '">' +
          '</div>';
        }).join('');
        return '<div class="hist-edit-ex">' +
          '<div class="hist-edit-ex-name">' + esc(e.exercise_name) + '</div>' +
          (setInputs || '<div style="font-size:12px;color:var(--text-muted);">No sets</div>') +
        '</div>';
      }).join('');
      exListInner =
        '<input class="hist-name-in" type="text" value="' + esc(w.name || '') + '" placeholder="Workout name" id="hn-' + w.id + '">' +
        (exEditRows || '<div style="font-size:13px;color:var(--text-muted);">No exercises to edit.</div>') +
        '<div class="hist-edit-actions">' +
          '<button class="btn-hist-cancel" onclick="event.stopPropagation();cancelHistoryEdit(' + idx + ')">Cancel</button>' +
          '<button class="btn-hist-save" onclick="event.stopPropagation();saveHistoryEdit(\'' + w.id + '\',' + idx + ')">Save Changes</button>' +
        '</div>';
    } else {
      var exRows = exs.map(function(e) {
        var sets = (e.workout_sets || []).slice().sort(function(a,b){ return (a.set_number||0)-(b.set_number||0); });
        var setsHtml = sets.map(function(s) {
          var val = s.weight_lbs != null
            ? s.weight_lbs + ' lbs × ' + (s.reps != null ? s.reps : '?')
            : (s.reps != null ? s.reps + ' reps' : '—');
          return '<span class="hist-set-pill' + (s.completed ? ' done' : '') + '">' + esc(String(val)) + '</span>';
        }).join('');
        return '<div class="history-ex-row">' +
          '<div class="hist-ex-name">' + esc(e.exercise_name) + '</div>' +
          '<div class="hist-sets-row">' + (setsHtml || '<span class="hist-set-pill">no sets</span>') + '</div>' +
        '</div>';
      }).join('');
      exListInner =
        (exRows || '<div style="font-size:13px;color:var(--text-muted);padding:4px 0;">No exercises logged.</div>') +
        '<div class="history-delete">' +
          '<button class="btn-edit-history" onclick="event.stopPropagation();enterEditMode(' + idx + ')">Edit</button>' +
          '<button class="btn-del-history" onclick="event.stopPropagation();deleteHistoryWorkout(\'' + w.id + '\',\'' + esc(w.name || 'Workout') + '\')">Delete</button>' +
        '</div>';
    }

    return '<div class="history-card' + (w._editing ? ' expanded' : '') + '" onclick="' + (w._editing ? 'void(0)' : 'toggleHistory(this)') + '">' +
      '<div class="history-top">' +
        '<div class="history-name">' + esc(w.name || 'Workout') + '</div>' +
        '<div class="history-date">' + date + '</div>' +
      '</div>' +
      subLine +
      '<div class="history-meta">' +
        (w.duration_minutes ? '<span class="history-stat"><strong>' + w.duration_minutes + '</strong> min</span>' : '') +
        '<span class="history-stat"><strong>' + exs.length + '</strong> exercises</span>' +
        '<span class="history-stat"><strong>' + doneSets + '/' + totalSets + '</strong> sets done</span>' +
      '</div>' +
      '<div class="history-exlist">' + exListInner + '</div>' +
    '</div>';
  }).join('');
}

function toggleHistory(card) {
  card.classList.toggle('expanded');
}

async function deleteHistoryWorkout(workoutId, workoutName) {
  if (!confirm('Delete "' + workoutName + '"? This cannot be undone.')) return;
  var { error } = await supabaseClient.from('workouts').delete().eq('id', workoutId);
  if (error) { showToast('Error deleting workout.'); return; }
  workoutHistory = workoutHistory.filter(function(w) { return w.id !== workoutId; });
  if (workoutHistory.length === 0) {
    var el = document.getElementById(_histTargetId);
    if (el) el.innerHTML = '<div class="empty-state">' + _histEmptyText + '</div>';
  } else {
    renderHistory();
  }
  showToast('Workout deleted.');
}

function enterEditMode(wIdx) {
  workoutHistory.forEach(function(w) { w._editing = false; });
  if (workoutHistory[wIdx]) workoutHistory[wIdx]._editing = true;
  renderHistory();
  setTimeout(function() {
    var expanded = document.querySelector('.history-card.expanded');
    if (expanded) expanded.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 60);
}

function cancelHistoryEdit(wIdx) {
  if (workoutHistory[wIdx]) workoutHistory[wIdx]._editing = false;
  renderHistory();
}

async function saveHistoryEdit(workoutId, wIdx) {
  var w = workoutHistory[wIdx];
  if (!w) return;
  try {
    var updates = [];
    var exs = w.workout_exercises || [];
    for (var i = 0; i < exs.length; i++) {
      var sets = exs[i].workout_sets || [];
      for (var j = 0; j < sets.length; j++) {
        var s = sets[j];
        var wEl = document.getElementById('hs-w-' + s.id);
        var rEl = document.getElementById('hs-r-' + s.id);
        var newWeight = (wEl && wEl.value !== '') ? parseFloat(wEl.value) : null;
        var newReps   = (rEl && rEl.value !== '') ? parseInt(rEl.value, 10) : null;
        if (newWeight !== s.weight_lbs || newReps !== s.reps) {
          updates.push({ id: s.id, weight_lbs: newWeight, reps: newReps });
          s.weight_lbs = newWeight;
          s.reps = newReps;
        }
      }
    }
    if (updates.length) {
      await Promise.all(updates.map(function(u) {
        return supabaseClient.from('workout_sets').update({ weight_lbs: u.weight_lbs, reps: u.reps }).eq('id', u.id);
      }));
    }
    var nameEl = document.getElementById('hn-' + workoutId);
    var nameVal = nameEl ? nameEl.value.trim() : w.name;
    if (nameVal && nameVal !== w.name) {
      await supabaseClient.from('workouts').update({ name: nameVal }).eq('id', workoutId);
      w.name = nameVal;
    }
    w._editing = false;
    renderHistory();
    showToast('Workout updated.');
  } catch (err) {
    console.error('saveHistoryEdit', err);
    showToast('Error saving — try again.');
  }
}
