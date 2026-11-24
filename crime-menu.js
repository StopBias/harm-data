// Which heritage options the Crime explorer can open.
// A published victim-by-offender table is a share. The UK homicide table lists
// those groups under by_measure.share. The US teen-violence table lists them
// only under by_measure.linked and leaves share empty, so the menus used to
// grey out every specific group. Linked groups count as share options. Groups
// with neither a share figure nor a linked cell stay unavailable.
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.CrimeMenu = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function explicitList(harm, who) {
    var a = harm && harm.availability;
    if (!a) return null;
    var key = who === "victims" ? "victims" : "perpetrators";
    var old = who === "victims" ? "victim_groups" : "perpetrator_groups";
    if (Array.isArray(a[key])) return a[key];
    if (Array.isArray(a[old])) return a[old];
    return null;
  }

  // Ids that appear in a published cross-table for this side.
  function linkedIds(harm, who) {
    var a = (harm && harm.availability) || {};
    var fromMeasure = a.by_measure && a.by_measure.linked && a.by_measure.linked[who];
    var idx = who === "victims" ? 0 : 1;
    var ids = [];
    if (Array.isArray(fromMeasure)) {
      fromMeasure.forEach(function (id) { ids.push(id); });
    }
    if (Array.isArray(a.linked_pairs)) {
      a.linked_pairs.forEach(function (pair) {
        if (pair && pair[idx]) ids.push(pair[idx]);
      });
    }
    return ids;
  }

  // Keep the country's group order. "all" is always eligible.
  function listedIds(groups, list) {
    var set = { all: true };
    (list || []).forEach(function (id) { if (id) set[id] = true; });
    var out = [];
    (groups || []).forEach(function (g) {
      if (g && set[g.id]) out.push(g.id);
    });
    return out;
  }

  function baseGroupIds(groups, harm, who, measure, groupHasData) {
    var a = harm && harm.availability;
    var m = measure || null;
    if (m && a && a.by_measure && a.by_measure[m] && Array.isArray(a.by_measure[m][who])) {
      var ids = a.by_measure[m][who].slice();
      if (m === "share") linkedIds(harm, who).forEach(function (id) { ids.push(id); });
      return listedIds(groups, ids);
    }
    var listed = explicitList(harm, who);
    if (listed) return listedIds(groups, listed);
    return (groups || []).filter(function (g) {
      return groupHasData(harm, who, g.id);
    }).map(function (g) { return g.id; });
  }

  function pairIsLinked(harm, v, p) {
    var pairs = harm && harm.availability && Array.isArray(harm.availability.linked_pairs)
      ? harm.availability.linked_pairs : null;
    if (pairs && pairs.length) return pairs.some(function (pair) { return pair[0] === v && pair[1] === p; });
    var cross = harm && harm.cross;
    return !!(cross && cross.status === "published" && cross.matrix && cross.matrix[v] && cross.matrix[v][p] != null);
  }

  function groupsAvailable(groups, harm, who, otherId, measure, groupHasData) {
    var base = baseGroupIds(groups, harm, who, measure, groupHasData);
    if (!otherId || otherId === "all") return base;
    return base.filter(function (g) {
      return g === "all" || (who === "perpetrators" ? pairIsLinked(harm, otherId, g) : pairIsLinked(harm, g, otherId));
    });
  }

  function sideListed(bm, harm, measure, who, id) {
    if ((bm[who] || []).indexOf(id) !== -1) return true;
    if (measure === "share" && linkedIds(harm, who).indexOf(id) !== -1) return true;
    return false;
  }

  function measureOpen(harm, measure, v, p, selectionHasMeasure) {
    var a = harm && harm.availability;
    var bm = a && a.by_measure && a.by_measure[measure];
    if (bm) {
      if (v !== "all" && p !== "all") {
        if (!pairIsLinked(harm, v, p)) return false;
        // Linked tables are almost always shares; a rate list that includes the pair's groups is also accepted.
        if (measure === "share") return true;
        return (bm.victims || []).indexOf(v) !== -1 || (bm.perpetrators || []).indexOf(p) !== -1;
      }
      if (v !== "all") return sideListed(bm, harm, measure, "victims", v);
      if (p !== "all") return sideListed(bm, harm, measure, "perpetrators", p);
      if ((bm.victims || []).length > 0 || (bm.perpetrators || []).length > 0) return true;
      if (measure === "share" && (linkedIds(harm, "victims").length || linkedIds(harm, "perpetrators").length)) return true;
      return false;
    }
    return selectionHasMeasure(harm, measure, v, p);
  }

  // A matrix cell is readable even when cross.groups omits a column (UK homicide "unknown").
  function matrixCell(cross, v, p) {
    if (!cross || !cross.matrix || !cross.matrix[v]) return null;
    var val = cross.matrix[v][p];
    return val == null ? null : val;
  }

  function columnRows(cross, p) {
    var groups = (cross && cross.groups) || [];
    var out = [];
    groups.forEach(function (g) {
      if (cross.matrix && cross.matrix[g] && cross.matrix[g][p] != null) out.push(g);
    });
    return out;
  }

  // cross.groups first, then any extra offender column the matrix actually publishes.
  function offenderIds(cross) {
    var ids = ((cross && cross.groups) || []).slice();
    var seen = {};
    ids.forEach(function (id) { seen[id] = true; });
    ids.slice().forEach(function (g) {
      var row = cross.matrix && cross.matrix[g];
      if (!row) return;
      Object.keys(row).forEach(function (o) {
        if (row[o] != null && !seen[o]) {
          seen[o] = true;
          ids.push(o);
        }
      });
    });
    return ids;
  }

  return {
    explicitList: explicitList,
    linkedIds: linkedIds,
    listedIds: listedIds,
    baseGroupIds: baseGroupIds,
    pairIsLinked: pairIsLinked,
    groupsAvailable: groupsAvailable,
    measureOpen: measureOpen,
    matrixCell: matrixCell,
    columnRows: columnRows,
    offenderIds: offenderIds
  };
});
