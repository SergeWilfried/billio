/* ============================================================
   Billio — Onboarding / setup wizard
   Vanilla JS: step nav, validation, dynamic rows, live preview.
   ============================================================ */
(function () {
  "use strict";

  /* ---- inject icons ---- */
  function paintIcons(root) {
    (root || document).querySelectorAll("i.ti").forEach(function (el) {
      if (el.dataset.done) return;
      var name = (el.className.match(/ti-([a-z0-9-]+)/) || [])[1];
      if (!name) return;
      var key = name.replace(/-filled$/, "");
      var dict = (typeof ICONS !== "undefined") ? ICONS : (window.ICONS || {});
      var path = dict[name] || dict[key];
      if (!path) return;
      var fill = /-filled$/.test(name);
      el.innerHTML =
        '<svg viewBox="0 0 24 24" fill="' + (fill ? "currentColor" : "none") +
        '" stroke="' + (fill ? "none" : "currentColor") +
        '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        path + "</svg>";
      el.dataset.done = "1";
    });
  }
  paintIcons(document);

  /* ---- state ---- */
  var STEPS = [
    { key: "biz",     label: "Business details", pane: "invoice", skippable: false },
    { key: "invoice", label: "Invoice defaults", pane: "invoice", skippable: false },
    { key: "team",    label: "Invite team",      pane: "team",    skippable: true  },
    { key: "clients", label: "Add clients",      pane: "clients", skippable: true  },
    { key: "finish",  label: "Finish",           pane: "summary", skippable: false }
  ];
  var cur = 0;
  var team = [{ name: "Serge Ouédraogo", email: "serge@studiowend.bf", role: "Owner", owner: true, avatar: "av-a" }];
  var clients = [];
  var AV = ["av-a", "av-b", "av-c", "av-d", "av-e", "av-f"];

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---- build segmented progress ---- */
  var segTrack = $("#segTrack");
  STEPS.forEach(function (s, i) {
    var seg = document.createElement("div");
    seg.className = "seg";
    seg.dataset.idx = i;
    seg.innerHTML = '<span class="seg-fill"></span>';
    seg.addEventListener("click", function () {
      if (i <= maxReached) goTo(i);
    });
    segTrack.appendChild(seg);
  });
  var maxReached = 0;

  function renderProgress() {
    $$(".seg", segTrack).forEach(function (seg, i) {
      seg.classList.toggle("active", i === cur);
      seg.classList.toggle("done", i < cur);
      seg.classList.toggle("locked", i > maxReached);
    });
    $("#progressLabel").innerHTML =
      'Step <b>' + (cur + 1) + '</b> of ' + STEPS.length +
      ' · <span class="pl-name">' + STEPS[cur].label + "</span>";
  }

  /* ---- step display ---- */
  function showStep() {
    $$(".step").forEach(function (el) {
      el.classList.toggle("active", +el.dataset.step === cur);
    });
    // aside pane
    var pane = STEPS[cur].pane;
    $$(".preview-pane").forEach(function (el) {
      el.classList.toggle("active", el.dataset.pane === pane);
    });
    $("#asideEyebrow").textContent =
      pane === "invoice" ? "Live invoice preview" :
      pane === "team" ? "Your workspace" :
      pane === "clients" ? "Your client book" : "Setup summary";

    // foot buttons
    $("#btnBack").hidden = cur === 0;
    $("#btnSkipStep").style.display = STEPS[cur].skippable ? "" : "none";
    var last = cur === STEPS.length - 1;
    $("#btnNext").innerHTML = last
      ? 'Go to dashboard <i class="ti ti-arrow-right"></i>'
      : 'Continue <i class="ti ti-arrow-right"></i>';
    if (last) { $("#btnNext").onclick = function () { window.location.href = "Billio Dashboard.html"; }; }
    else { $("#btnNext").onclick = onNext; }

    // foot hint
    var rem = STEPS.length - 1 - cur;
    $("#footHint").innerHTML = last
      ? '<i class="ti ti-circle-check-filled"></i> Setup complete'
      : '<i class="ti ti-clock"></i> ' + (rem > 1 ? rem + " quick steps left" : "Last step before you're done");

    paintIcons(document);
    renderProgress();
    $("#wizMain").scrollTop = 0;
    if (last) refreshSummary();
  }

  function goTo(i) {
    cur = Math.max(0, Math.min(STEPS.length - 1, i));
    maxReached = Math.max(maxReached, cur);
    showStep();
  }

  /* ---- validation ---- */
  function validateStep() {
    if (cur === 0) {
      var name = $("#fBizName");
      if (!name.value.trim()) { flagError(name); return false; }
    }
    if (cur === 1) {
      var pfx = $("#fNextNum");
      if (!pfx.value.trim()) { flagError(pfx); return false; }
    }
    return true;
  }
  function flagError(el) {
    el.classList.add("err");
    el.focus();
    el.addEventListener("input", function h() { el.classList.remove("err"); el.removeEventListener("input", h); });
  }

  function onNext() {
    if (!validateStep()) return;
    goTo(cur + 1);
  }

  $("#btnBack").onclick = function () { goTo(cur - 1); };
  $("#btnSkipStep").onclick = function () { goTo(cur + 1); };

  /* ============================================================
     STEP 1 — business details + logo
     ============================================================ */
  var logoState = { type: "none", url: null, mono: "SW" };

  function initials(name) {
    var parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "B";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function renderLogo() {
    var slot = $("#logoSlot");
    var pv = $("#pvLogo");
    if (logoState.type === "img" && logoState.url) {
      slot.className = "logo-slot";
      slot.innerHTML = '<img src="' + logoState.url + '" alt="logo">' +
        '<input type="file" accept="image/*" hidden id="logoInput">';
      pv.innerHTML = '<img src="' + logoState.url + '" alt="">';
      bindLogoInput();
    } else if (logoState.type === "mono") {
      slot.className = "logo-slot has-mono";
      slot.innerHTML = '<div class="logo-mono">' + logoState.mono + "</div>" +
        '<input type="file" accept="image/*" hidden id="logoInput">';
      pv.innerHTML = logoState.mono;
      bindLogoInput();
    } else {
      slot.className = "logo-slot";
      slot.innerHTML = '<i class="ti ti-camera"></i><span>Upload</span>' +
        '<input type="file" accept="image/*" hidden id="logoInput">';
      pv.innerHTML = logoState.mono;
      bindLogoInput();
      paintIcons(slot);
    }
  }
  function bindLogoInput() {
    var inp = $("#logoInput");
    if (!inp) return;
    inp.onchange = function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () { logoState.type = "img"; logoState.url = rd.result; renderLogo(); };
      rd.readAsDataURL(f);
    };
  }
  $("#logoPick").onclick = function () { $("#logoInput").click(); };
  $("#logoMono").onclick = function () {
    logoState.type = logoState.type === "mono" ? "none" : "mono";
    renderLogo();
  };

  /* live preview bindings */
  function fmt(n) { return Math.round(n).toLocaleString("fr-FR").replace(/\u202f/g, " "); }

  function syncInvoicePreview() {
    var name = $("#fBizName").value.trim() || "Your business";
    logoState.mono = initials(name);
    $("#pvBizName").textContent = name;
    if (logoState.type !== "img") renderLogo();

    var addr = $("#fAddress").value.trim();
    var city = $("#fCity").value.trim();
    var country = $("#fCountry").value;
    $("#pvBizMeta").innerHTML =
      (addr ? addr + "<br>" : "") + [city, country].filter(Boolean).join(", ");

    // invoice defaults
    var prefix = $("#fPrefix").value.trim();
    var num = $("#fNextNum").value.trim();
    var docnum = "#" + prefix + num;
    $("#pvDocNum").textContent = docnum;
    $("#prefixPreview").textContent = docnum;
    $("#statInvoice").textContent = docnum;

    var cur3 = $("#fCurrency").value;
    var taxRate = parseFloat($("#fTax").value) || 0;
    var sub = 770000;
    var taxVal = sub * taxRate / 100;
    $("#pvItem1").textContent = fmt(650000);
    $("#pvItem2").textContent = fmt(120000);
    $("#pvSubtotal").textContent = fmt(sub);
    $("#pvTaxLabel").textContent = "TVA (" + taxRate + "%)";
    $("#pvTaxVal").textContent = fmt(taxVal);
    $("#pvTotal").textContent = fmt(sub + taxVal) + " " + cur3;

    var term = (($(".chip.active", $("#termsChips")) || {}).dataset || {}).val || "Net 14 days";
    $("#pvTerms").innerHTML = term + '<span class="dim"><br>Due 20 Jun 2026</span>';

    var note = $("#fFooter").value.trim();
    $("#pvNote").textContent = note;
  }

  $$("[data-preview]").forEach(function (el) {
    el.addEventListener("input", syncInvoicePreview);
    el.addEventListener("change", syncInvoicePreview);
  });
  $("#fAddress").addEventListener("input", syncInvoicePreview);
  $("#fCity").addEventListener("input", syncInvoicePreview);
  $("#fCountry").addEventListener("change", syncInvoicePreview);

  /* terms chips */
  $$(".chip", $("#termsChips")).forEach(function (chip) {
    chip.addEventListener("click", function () {
      $$(".chip", $("#termsChips")).forEach(function (c) { c.classList.remove("active"); });
      chip.classList.add("active");
      syncInvoicePreview();
    });
  });

  /* ============================================================
     STEP 3 — team
     ============================================================ */
  function renderTeam() {
    var list = $("#teamList");
    var invites = team.filter(function (t) { return !t.owner; });
    if (!invites.length) {
      list.innerHTML = '<div class="empty-note">No invites yet. It\'s just you — add teammates above or skip.</div>';
    } else {
      list.innerHTML = invites.map(function (t, i) {
        return entryRow(t, "team", i);
      }).join("");
    }
    bindDeletes(list, "team");

    // roster preview
    $("#teamCount").textContent = team.length;
    $("#statTeam").textContent = team.length;
    $("#teamRoster").innerHTML = team.map(function (t) {
      return '<div class="roster-row">' +
        '<div class="entry-av ' + t.avatar + '">' + avInit(t) + "</div>" +
        '<div style="flex:1;min-width:0;"><div class="roster-name">' + esc(t.name || t.email) + "</div>" +
        '<div class="roster-sub">' + esc(t.email) + "</div></div>" +
        '<div class="entry-role' + (t.owner ? " owner" : "") + '">' + t.role + "</div></div>";
    }).join("");
  }

  function avInit(t) {
    if (t.name) return initials(t.name);
    return (t.email || "?")[0].toUpperCase();
  }

  function entryRow(t, kind, i) {
    return '<div class="entry">' +
      '<div class="entry-av ' + t.avatar + '">' + avInit(t) + "</div>" +
      '<div class="entry-main"><div class="entry-name">' + esc(t.name || t.email) + "</div>" +
      '<div class="entry-sub">' + esc(kind === "team" ? t.email : (t.email || "No email")) + "</div></div>" +
      (kind === "team" ? '<div class="entry-role">' + t.role + "</div>" : "") +
      '<button class="entry-del" data-i="' + i + '" title="Remove"><i class="ti ti-trash"></i></button></div>';
  }

  function bindDeletes(list, kind) {
    $$(".entry-del", list).forEach(function (b) {
      b.addEventListener("click", function () {
        var i = +b.dataset.i;
        if (kind === "team") {
          var owner = team.find(function (t) { return t.owner; });
          var invites = team.filter(function (t) { return !t.owner; });
          invites.splice(i, 1);
          team = [owner].concat(invites);
          renderTeam();
        } else {
          clients.splice(i, 1);
          renderClients();
        }
      });
    });
    paintIcons(list);
  }

  $("#addTeam").onclick = function () {
    var email = $("#teamEmail").value.trim();
    if (!email || !/.+@.+\..+/.test(email)) { flagError($("#teamEmail")); return; }
    team.push({ email: email, role: $("#teamRole").value, owner: false, avatar: AV[team.length % AV.length], name: "" });
    $("#teamEmail").value = "";
    renderTeam();
  };
  $("#teamEmail").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); $("#addTeam").click(); } });

  /* ============================================================
     STEP 4 — clients
     ============================================================ */
  function renderClients() {
    var list = $("#clientList");
    if (!clients.length) {
      list.innerHTML = '<div class="empty-note">No clients yet. Add a few above, or add them later when you invoice.</div>';
    } else {
      list.innerHTML = clients.map(function (c, i) { return entryRow(c, "client", i); }).join("");
    }
    bindDeletes(list, "client");

    $("#clientCount").textContent = clients.length;
    $("#statClients").textContent = clients.length;
    var roster = $("#clientRoster");
    if (!clients.length) {
      roster.innerHTML = '<div class="empty-note" style="margin:8px 0;">Your clients will appear here.<br>Add your first one on the left.</div>';
    } else {
      roster.innerHTML = clients.map(function (c) {
        return '<div class="roster-row">' +
          '<div class="entry-av ' + c.avatar + '">' + avInit(c) + "</div>" +
          '<div style="flex:1;min-width:0;"><div class="roster-name">' + esc(c.name) + "</div>" +
          '<div class="roster-sub">' + esc(c.email || "No billing email") + "</div></div></div>";
      }).join("");
    }
  }

  $("#addClient").onclick = function () {
    var name = $("#clientName").value.trim();
    if (!name) { flagError($("#clientName")); return; }
    clients.push({ name: name, email: $("#clientEmail").value.trim(), avatar: AV[clients.length % AV.length] });
    $("#clientName").value = ""; $("#clientEmail").value = "";
    renderClients();
  };
  $("#clientName").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); $("#addClient").click(); } });
  $("#clientEmail").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); $("#addClient").click(); } });
  $("#importCsv").onclick = function () {
    // demo: seed a couple clients
    if (!clients.some(function (c) { return c.name === "Sahel Banque"; })) {
      clients.push({ name: "Sahel Banque", email: "finance@sahel.bf", avatar: AV[clients.length % AV.length] });
      clients.push({ name: "Faso Textiles", email: "compta@fasotextiles.bf", avatar: AV[clients.length % AV.length] });
      clients.push({ name: "Ouaga Catering", email: "", avatar: AV[clients.length % AV.length] });
      renderClients();
      goTo(3);
    }
  };

  /* ============================================================
     STEP 5 — summary
     ============================================================ */
  function refreshSummary() {
    $("#sumBiz").textContent = $("#fBizName").value.trim() || "Your business";
    $("#sumInv").textContent = "Prefix " + $("#fPrefix").value.trim() + " · " + (parseFloat($("#fTax").value) || 0) + "% TVA";
    var invites = team.filter(function (t) { return !t.owner; }).length;
    $("#sumTeam").textContent = invites ? invites + " invite" + (invites > 1 ? "s" : "") + " sent" : "Just you for now";
    $("#sumTeamTick").className = "check-tick" + (invites ? "" : " skip");
    $("#sumClient").textContent = clients.length ? clients.length + " client" + (clients.length > 1 ? "s" : "") + " added" : "No clients yet";
    $("#sumClientTick").className = "check-tick" + (clients.length ? "" : " skip");
    $(".finish-title").textContent = "You're all set!";
  }

  $$(".check-edit").forEach(function (el) {
    el.addEventListener("click", function () { goTo(+el.dataset.goto); });
  });

  /* ---- utils ---- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* ---- prefix preview keeps in sync even before step shown ---- */
  $("#fPrefix").addEventListener("input", syncInvoicePreview);
  $("#fNextNum").addEventListener("input", syncInvoicePreview);
  $("#fTax").addEventListener("input", syncInvoicePreview);

  /* ---- boot ---- */
  renderLogo();
  syncInvoicePreview();
  renderTeam();
  renderClients();
  showStep();

  /* expose for tweaks */
  window.__billioOnboarding = { paintIcons: paintIcons };
})();
