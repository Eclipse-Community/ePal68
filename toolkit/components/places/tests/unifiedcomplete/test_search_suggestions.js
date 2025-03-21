const { FormHistory } = ChromeUtils.import(
  "resource://gre/modules/FormHistory.jsm"
);

const ENGINE_NAME = "engine-suggestions.xml";
// This is fixed to match the port number in engine-suggestions.xml.
const SERVER_PORT = 9000;
const SUGGEST_PREF = "browser.urlbar.suggest.searches";
const SUGGEST_ENABLED_PREF = "browser.search.suggest.enabled";

var suggestionsFn;
var previousSuggestionsFn;

function setSuggestionsFn(fn) {
  previousSuggestionsFn = suggestionsFn;
  suggestionsFn = fn;
}

async function cleanUpSuggestions() {
  await cleanup();
  if (previousSuggestionsFn) {
    suggestionsFn = previousSuggestionsFn;
    previousSuggestionsFn = null;
  }
}

add_task(async function setup() {
  Services.prefs.setCharPref(
    "browser.urlbar.matchBuckets",
    "general:5,suggestion:Infinity"
  );
  Services.prefs.setBoolPref("browser.urlbar.geoSpecificDefaults", false);

  let engine = await addTestSuggestionsEngine(searchStr => {
    return suggestionsFn(searchStr);
  });
  setSuggestionsFn(searchStr => {
    let suffixes = ["foo", "bar"];
    return [searchStr].concat(suffixes.map(s => searchStr + " " + s));
  });

  // Install the test engine.
  let oldDefaultEngine = await Services.search.getDefault();
  registerCleanupFunction(async () =>
    Services.search.setDefault(oldDefaultEngine)
  );
  Services.search.setDefault(engine);

  // We must make sure the FormHistoryStartup component is initialized.
  Cc["@mozilla.org/satchel/form-history-startup;1"]
    .getService(Ci.nsIObserver)
    .observe(null, "profile-after-change", null);
  await updateSearchHistory("bump", "hello Fred!");
  await updateSearchHistory("bump", "hello Barney!");
});

add_task(async function disabled_urlbarSuggestions() {
  Services.prefs.setBoolPref(SUGGEST_PREF, false);
  Services.prefs.setBoolPref(SUGGEST_ENABLED_PREF, true);
  await check_autocomplete({
    search: "hello",
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch("hello", { engineName: ENGINE_NAME, heuristic: true }),
    ],
  });
  await cleanUpSuggestions();
});

add_task(async function disabled_allSuggestions() {
  Services.prefs.setBoolPref(SUGGEST_PREF, true);
  Services.prefs.setBoolPref(SUGGEST_ENABLED_PREF, false);
  await check_autocomplete({
    search: "hello",
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch("hello", { engineName: ENGINE_NAME, heuristic: true }),
    ],
  });
  await cleanUpSuggestions();
});

add_task(async function disabled_privateWindow() {
  Services.prefs.setBoolPref(SUGGEST_PREF, true);
  Services.prefs.setBoolPref(SUGGEST_ENABLED_PREF, true);
  await check_autocomplete({
    search: "hello",
    searchParam: "private-window enable-actions",
    matches: [
      makeSearchMatch("hello", { engineName: ENGINE_NAME, heuristic: true }),
    ],
  });
  await cleanUpSuggestions();
});

add_task(async function singleWordQuery() {
  Services.prefs.setBoolPref(SUGGEST_PREF, true);
  Services.prefs.setBoolPref(SUGGEST_ENABLED_PREF, true);

  await check_autocomplete({
    search: "hello",
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch("hello", { engineName: ENGINE_NAME, heuristic: true }),
      // The test engine echoes back the search string as the first suggestion,
      // so it would appear here (as "hello"), but we remove suggestions that
      // duplicate the search string, so it should not actually appear.
      {
        uri: makeActionURI("searchengine", {
          engineName: ENGINE_NAME,
          input: "hello foo",
          searchQuery: "hello",
          searchSuggestion: "hello foo",
        }),
        title: ENGINE_NAME,
        style: ["action", "searchengine", "suggestion"],
        icon: "",
      },
      {
        uri: makeActionURI("searchengine", {
          engineName: ENGINE_NAME,
          input: "hello bar",
          searchQuery: "hello",
          searchSuggestion: "hello bar",
        }),
        title: ENGINE_NAME,
        style: ["action", "searchengine", "suggestion"],
        icon: "",
      },
    ],
  });

  await cleanUpSuggestions();
});

add_task(async function multiWordQuery() {
  Services.prefs.setBoolPref(SUGGEST_PREF, true);
  Services.prefs.setBoolPref(SUGGEST_ENABLED_PREF, true);

  await check_autocomplete({
    search: "hello world",
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch("hello world", {
        engineName: ENGINE_NAME,
        heuristic: true,
      }),
      {
        uri: makeActionURI("searchengine", {
          engineName: ENGINE_NAME,
          input: "hello world foo",
          searchQuery: "hello world",
          searchSuggestion: "hello world foo",
        }),
        title: ENGINE_NAME,
        style: ["action", "searchengine", "suggestion"],
        icon: "",
      },
      {
        uri: makeActionURI("searchengine", {
          engineName: ENGINE_NAME,
          input: "hello world bar",
          searchQuery: "hello world",
          searchSuggestion: "hello world bar",
        }),
        title: ENGINE_NAME,
        style: ["action", "searchengine", "suggestion"],
        icon: "",
      },
    ],
  });

  await cleanUpSuggestions();
});

add_task(async function suffixMatch() {
  Services.prefs.setBoolPref(SUGGEST_PREF, true);
  Services.prefs.setBoolPref(SUGGEST_ENABLED_PREF, true);

  setSuggestionsFn(searchStr => {
    let prefixes = ["baz", "quux"];
    return prefixes.map(p => p + " " + searchStr);
  });

  await check_autocomplete({
    search: "hello",
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch("hello", { engineName: ENGINE_NAME, heuristic: true }),
      {
        uri: makeActionURI("searchengine", {
          engineName: ENGINE_NAME,
          input: "baz hello",
          searchQuery: "hello",
          searchSuggestion: "baz hello",
        }),
        title: ENGINE_NAME,
        style: ["action", "searchengine", "suggestion"],
        icon: "",
      },
      {
        uri: makeActionURI("searchengine", {
          engineName: ENGINE_NAME,
          input: "quux hello",
          searchQuery: "hello",
          searchSuggestion: "quux hello",
        }),
        title: ENGINE_NAME,
        style: ["action", "searchengine", "suggestion"],
        icon: "",
      },
    ],
  });

  await cleanUpSuggestions();
});

add_task(async function queryIsNotASubstring() {
  Services.prefs.setBoolPref(SUGGEST_PREF, true);

  setSuggestionsFn(searchStr => {
    return ["aaa", "bbb"];
  });

  await check_autocomplete({
    search: "hello",
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch("hello", { engineName: ENGINE_NAME, heuristic: true }),
      {
        uri: makeActionURI("searchengine", {
          engineName: ENGINE_NAME,
          input: "aaa",
          searchQuery: "hello",
          searchSuggestion: "aaa",
        }),
        title: ENGINE_NAME,
        style: ["action", "searchengine", "suggestion"],
        icon: "",
      },
      {
        uri: makeActionURI("searchengine", {
          engineName: ENGINE_NAME,
          input: "bbb",
          searchQuery: "hello",
          searchSuggestion: "bbb",
        }),
        title: ENGINE_NAME,
        style: ["action", "searchengine", "suggestion"],
        icon: "",
      },
    ],
  });

  await cleanUpSuggestions();
});

add_task(async function restrictToken() {
  Services.prefs.setBoolPref(SUGGEST_PREF, true);
  Services.prefs.setBoolPref(SUGGEST_ENABLED_PREF, true);

  // Add a visit and a bookmark.  Actually, make the bookmark visited too so
  // that it's guaranteed, with its higher frecency, to appear above the search
  // suggestions.
  await PlacesTestUtils.addVisits([
    {
      uri: NetUtil.newURI("http://example.com/hello-visit"),
      title: "hello visit",
    },
    {
      uri: NetUtil.newURI("http://example.com/hello-bookmark"),
      title: "hello bookmark",
    },
  ]);

  await addBookmark({
    uri: NetUtil.newURI("http://example.com/hello-bookmark"),
    title: "hello bookmark",
  });

  // Do an unrestricted search to make sure everything appears in it, including
  // the visit and bookmark.
  await check_autocomplete({
    search: "hello",
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch("hello", { engineName: ENGINE_NAME, heuristic: true }),
      {
        uri: NetUtil.newURI("http://example.com/hello-visit"),
        title: "hello visit",
      },
      {
        uri: NetUtil.newURI("http://example.com/hello-bookmark"),
        title: "hello bookmark",
        style: ["bookmark"],
      },
      {
        uri: makeActionURI("searchengine", {
          engineName: ENGINE_NAME,
          input: "hello foo",
          searchQuery: "hello",
          searchSuggestion: "hello foo",
        }),
        title: ENGINE_NAME,
        style: ["action", "searchengine", "suggestion"],
        icon: "",
      },
      {
        uri: makeActionURI("searchengine", {
          engineName: ENGINE_NAME,
          input: "hello bar",
          searchQuery: "hello",
          searchSuggestion: "hello bar",
        }),
        title: ENGINE_NAME,
        style: ["action", "searchengine", "suggestion"],
        icon: "",
      },
    ],
  });

  // Now do a restricted search to make sure only suggestions appear.
  await check_autocomplete({
    search: `${UrlbarTokenizer.RESTRICT.SEARCH} hello`,
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch(`${UrlbarTokenizer.RESTRICT.SEARCH} hello`, {
        searchQuery: "hello",
        engineName: ENGINE_NAME,
        heuristic: true,
      }),
      {
        uri: makeActionURI("searchengine", {
          engineName: ENGINE_NAME,
          input: "hello foo",
          searchQuery: "hello",
          searchSuggestion: "hello foo",
        }),
        title: ENGINE_NAME,
        style: ["action", "searchengine", "suggestion"],
        icon: "",
      },
      {
        uri: makeActionURI("searchengine", {
          engineName: ENGINE_NAME,
          input: "hello bar",
          searchQuery: "hello",
          searchSuggestion: "hello bar",
        }),
        title: ENGINE_NAME,
        style: ["action", "searchengine", "suggestion"],
        icon: "",
      },
    ],
  });

  // Typing the search restriction char shows only the Search Engine entry with
  // no query.
  await check_autocomplete({
    search: UrlbarTokenizer.RESTRICT.SEARCH,
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch(UrlbarTokenizer.RESTRICT.SEARCH, {
        searchQuery: "",
        engineName: ENGINE_NAME,
        heuristic: true,
      }),
    ],
  });
  // Also if followed by multiple spaces.
  await check_autocomplete({
    search: UrlbarTokenizer.RESTRICT.SEARCH + "  ",
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch(UrlbarTokenizer.RESTRICT.SEARCH + "  ", {
        searchQuery: "",
        engineName: ENGINE_NAME,
        heuristic: true,
      }),
    ],
  });
  // Also if followed by a single char.
  await check_autocomplete({
    search: UrlbarTokenizer.RESTRICT.SEARCH + "a",
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch(UrlbarTokenizer.RESTRICT.SEARCH + "a", {
        searchQuery: "a",
        engineName: ENGINE_NAME,
        heuristic: true,
      }),
    ],
  });
  // Also if followed by a space and single char.
  await check_autocomplete({
    search: UrlbarTokenizer.RESTRICT.SEARCH + " a",
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch(UrlbarTokenizer.RESTRICT.SEARCH + " a", {
        searchQuery: "a",
        engineName: ENGINE_NAME,
        heuristic: true,
      }),
    ],
  });
  // Any other restriction char allows to search for it.
  await check_autocomplete({
    search: UrlbarTokenizer.RESTRICT.OPENPAGE,
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch(UrlbarTokenizer.RESTRICT.OPENPAGE, {
        engineName: ENGINE_NAME,
        heuristic: true,
      }),
    ],
  });

  await cleanUpSuggestions();
});

add_task(async function mixup_frecency() {
  Services.prefs.setBoolPref(SUGGEST_PREF, true);

  // Add a visit and a bookmark.  Actually, make the bookmark visited too so
  // that it's guaranteed, with its higher frecency, to appear above the search
  // suggestions.
  await PlacesTestUtils.addVisits([
    { uri: NetUtil.newURI("http://example.com/lo0"), title: "low frecency 0" },
    { uri: NetUtil.newURI("http://example.com/lo1"), title: "low frecency 1" },
    { uri: NetUtil.newURI("http://example.com/lo2"), title: "low frecency 2" },
    { uri: NetUtil.newURI("http://example.com/lo3"), title: "low frecency 3" },
    { uri: NetUtil.newURI("http://example.com/lo4"), title: "low frecency 4" },
  ]);

  for (let i = 0; i < 4; i++) {
    let href = `http://example.com/lo${i}`;
    let frecency = frecencyForUrl(href);
    Assert.ok(
      frecency < FRECENCY_DEFAULT,
      `frecency for ${href}: ${frecency}, should be lower than ${FRECENCY_DEFAULT}`
    );
  }

  for (let i = 0; i < 5; i++) {
    await PlacesTestUtils.addVisits([
      {
        uri: NetUtil.newURI("http://example.com/hi0"),
        title: "high frecency 0",
        transition: TRANSITION_TYPED,
      },
      {
        uri: NetUtil.newURI("http://example.com/hi1"),
        title: "high frecency 1",
        transition: TRANSITION_TYPED,
      },
      {
        uri: NetUtil.newURI("http://example.com/hi2"),
        title: "high frecency 2",
        transition: TRANSITION_TYPED,
      },
      {
        uri: NetUtil.newURI("http://example.com/hi3"),
        title: "high frecency 3",
        transition: TRANSITION_TYPED,
      },
    ]);
  }

  for (let i = 0; i < 4; i++) {
    let href = `http://example.com/hi${i}`;
    await addBookmark({ uri: href, title: `high frecency ${i}` });
    let frecency = frecencyForUrl(href);
    Assert.ok(
      frecency > FRECENCY_DEFAULT,
      `frecency for ${href}: ${frecency}, should be higher than ${FRECENCY_DEFAULT}`
    );
  }

  // Do an unrestricted search to make sure everything appears in it, including
  // the visit and bookmark.
  await check_autocomplete({
    checkSorting: true,
    search: "frecency",
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch("frecency", { engineName: ENGINE_NAME, heuristic: true }),
      {
        uri: NetUtil.newURI("http://example.com/hi3"),
        title: "high frecency 3",
        style: ["bookmark"],
      },
      {
        uri: NetUtil.newURI("http://example.com/hi2"),
        title: "high frecency 2",
        style: ["bookmark"],
      },
      {
        uri: NetUtil.newURI("http://example.com/hi1"),
        title: "high frecency 1",
        style: ["bookmark"],
      },
      {
        uri: NetUtil.newURI("http://example.com/hi0"),
        title: "high frecency 0",
        style: ["bookmark"],
      },
      {
        uri: NetUtil.newURI("http://example.com/lo4"),
        title: "low frecency 4",
      },
      {
        uri: makeActionURI("searchengine", {
          engineName: ENGINE_NAME,
          input: "frecency foo",
          searchQuery: "frecency",
          searchSuggestion: "frecency foo",
        }),
        title: ENGINE_NAME,
        style: ["action", "searchengine", "suggestion"],
        icon: "",
      },
      {
        uri: makeActionURI("searchengine", {
          engineName: ENGINE_NAME,
          input: "frecency bar",
          searchQuery: "frecency",
          searchSuggestion: "frecency bar",
        }),
        title: ENGINE_NAME,
        style: ["action", "searchengine", "suggestion"],
        icon: "",
      },
      {
        uri: NetUtil.newURI("http://example.com/lo3"),
        title: "low frecency 3",
      },
      {
        uri: NetUtil.newURI("http://example.com/lo2"),
        title: "low frecency 2",
      },
      {
        uri: NetUtil.newURI("http://example.com/lo1"),
        title: "low frecency 1",
      },
      {
        uri: NetUtil.newURI("http://example.com/lo0"),
        title: "low frecency 0",
      },
    ],
  });

  // Change the "general" context mixup.
  Services.prefs.setCharPref(
    "browser.urlbar.matchBuckets",
    "suggestion:1,general:5,suggestion:1"
  );

  // Do an unrestricted search to make sure everything appears in it, including
  // the visit and bookmark.
  await check_autocomplete({
    checkSorting: true,
    search: "frecency",
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch("frecency", { engineName: ENGINE_NAME, heuristic: true }),
      {
        uri: makeActionURI("searchengine", {
          engineName: ENGINE_NAME,
          input: "frecency foo",
          searchQuery: "frecency",
          searchSuggestion: "frecency foo",
        }),
        title: ENGINE_NAME,
        style: ["action", "searchengine", "suggestion"],
        icon: "",
      },
      {
        uri: NetUtil.newURI("http://example.com/hi3"),
        title: "high frecency 3",
        style: ["bookmark"],
      },
      {
        uri: NetUtil.newURI("http://example.com/hi2"),
        title: "high frecency 2",
        style: ["bookmark"],
      },
      {
        uri: NetUtil.newURI("http://example.com/hi1"),
        title: "high frecency 1",
        style: ["bookmark"],
      },
      {
        uri: NetUtil.newURI("http://example.com/hi0"),
        title: "high frecency 0",
        style: ["bookmark"],
      },
      {
        uri: NetUtil.newURI("http://example.com/lo4"),
        title: "low frecency 4",
      },
      {
        uri: makeActionURI("searchengine", {
          engineName: ENGINE_NAME,
          input: "frecency bar",
          searchQuery: "frecency",
          searchSuggestion: "frecency bar",
        }),
        title: ENGINE_NAME,
        style: ["action", "searchengine", "suggestion"],
        icon: "",
      },
      {
        uri: NetUtil.newURI("http://example.com/lo3"),
        title: "low frecency 3",
      },
      {
        uri: NetUtil.newURI("http://example.com/lo2"),
        title: "low frecency 2",
      },
      {
        uri: NetUtil.newURI("http://example.com/lo1"),
        title: "low frecency 1",
      },
      {
        uri: NetUtil.newURI("http://example.com/lo0"),
        title: "low frecency 0",
      },
    ],
  });

  // Change the "search" context mixup.
  Services.prefs.setCharPref(
    "browser.urlbar.matchBucketsSearch",
    "suggestion:2,general:4"
  );

  await check_autocomplete({
    checkSorting: true,
    search: "frecency",
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch("frecency", { engineName: ENGINE_NAME, heuristic: true }),
      {
        uri: makeActionURI("searchengine", {
          engineName: ENGINE_NAME,
          input: "frecency foo",
          searchQuery: "frecency",
          searchSuggestion: "frecency foo",
        }),
        title: ENGINE_NAME,
        style: ["action", "searchengine", "suggestion"],
        icon: "",
      },
      {
        uri: makeActionURI("searchengine", {
          engineName: ENGINE_NAME,
          input: "frecency bar",
          searchQuery: "frecency",
          searchSuggestion: "frecency bar",
        }),
        title: ENGINE_NAME,
        style: ["action", "searchengine", "suggestion"],
        icon: "",
      },
      {
        uri: NetUtil.newURI("http://example.com/hi3"),
        title: "high frecency 3",
        style: ["bookmark"],
      },
      {
        uri: NetUtil.newURI("http://example.com/hi2"),
        title: "high frecency 2",
        style: ["bookmark"],
      },
      {
        uri: NetUtil.newURI("http://example.com/hi1"),
        title: "high frecency 1",
        style: ["bookmark"],
      },
      {
        uri: NetUtil.newURI("http://example.com/hi0"),
        title: "high frecency 0",
        style: ["bookmark"],
      },
      {
        uri: NetUtil.newURI("http://example.com/lo4"),
        title: "low frecency 4",
      },
      {
        uri: NetUtil.newURI("http://example.com/lo3"),
        title: "low frecency 3",
      },
      {
        uri: NetUtil.newURI("http://example.com/lo2"),
        title: "low frecency 2",
      },
      {
        uri: NetUtil.newURI("http://example.com/lo1"),
        title: "low frecency 1",
      },
      {
        uri: NetUtil.newURI("http://example.com/lo0"),
        title: "low frecency 0",
      },
    ],
  });

  Services.prefs.setCharPref(
    "browser.urlbar.matchBuckets",
    "general:5,suggestion:Infinity"
  );
  Services.prefs.clearUserPref("browser.urlbar.matchBucketsSearch");
  await cleanUpSuggestions();
});

add_task(async function prohibit_suggestions() {
  Services.prefs.setBoolPref(SUGGEST_PREF, true);
  Services.prefs.setBoolPref("browser.fixup.domainwhitelist.localhost", false);

  await check_autocomplete({
    search: "localhost",
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch("localhost", {
        engineName: ENGINE_NAME,
        heuristic: true,
      }),
      {
        uri: makeActionURI("searchengine", {
          engineName: ENGINE_NAME,
          input: "localhost foo",
          searchQuery: "localhost",
          searchSuggestion: "localhost foo",
        }),
        title: ENGINE_NAME,
        style: ["action", "searchengine", "suggestion"],
        icon: "",
      },
      {
        uri: makeActionURI("searchengine", {
          engineName: ENGINE_NAME,
          input: "localhost bar",
          searchQuery: "localhost",
          searchSuggestion: "localhost bar",
        }),
        title: ENGINE_NAME,
        style: ["action", "searchengine", "suggestion"],
        icon: "",
      },
    ],
  });
  Services.prefs.setBoolPref("browser.fixup.domainwhitelist.localhost", true);
  registerCleanupFunction(() => {
    Services.prefs.setBoolPref(
      "browser.fixup.domainwhitelist.localhost",
      false
    );
  });
  await check_autocomplete({
    search: "localhost",
    searchParam: "enable-actions",
    matches: [
      makeVisitMatch("localhost", "http://localhost/", { heuristic: true }),
      makeSearchMatch("localhost", {
        engineName: ENGINE_NAME,
        heuristic: false,
      }),
    ],
  });

  // When using multiple words, we should still get suggestions:
  await check_autocomplete({
    search: "localhost other",
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch("localhost other", {
        engineName: ENGINE_NAME,
        heuristic: true,
      }),
      {
        uri: makeActionURI("searchengine", {
          engineName: ENGINE_NAME,
          input: "localhost other foo",
          searchQuery: "localhost other",
          searchSuggestion: "localhost other foo",
        }),
        title: ENGINE_NAME,
        style: ["action", "searchengine", "suggestion"],
        icon: "",
      },
      {
        uri: makeActionURI("searchengine", {
          engineName: ENGINE_NAME,
          input: "localhost other bar",
          searchQuery: "localhost other",
          searchSuggestion: "localhost other bar",
        }),
        title: ENGINE_NAME,
        style: ["action", "searchengine", "suggestion"],
        icon: "",
      },
    ],
  });

  // Clear the whitelist for localhost, and try preferring DNS for any single
  // word instead:
  Services.prefs.setBoolPref("browser.fixup.domainwhitelist.localhost", false);
  Services.prefs.setBoolPref("browser.fixup.dns_first_for_single_words", true);
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("browser.fixup.dns_first_for_single_words");
  });

  await check_autocomplete({
    search: "localhost",
    searchParam: "enable-actions",
    matches: [
      makeVisitMatch("localhost", "http://localhost/", { heuristic: true }),
      makeSearchMatch("localhost", {
        engineName: ENGINE_NAME,
        heuristic: false,
      }),
    ],
  });

  await check_autocomplete({
    search: "somethingelse",
    searchParam: "enable-actions",
    matches: [
      makeVisitMatch("somethingelse", "http://somethingelse/", {
        heuristic: true,
      }),
      makeSearchMatch("somethingelse", {
        engineName: ENGINE_NAME,
        heuristic: false,
      }),
    ],
  });

  // When using multiple words, we should still get suggestions:
  await check_autocomplete({
    search: "localhost other",
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch("localhost other", {
        engineName: ENGINE_NAME,
        heuristic: true,
      }),
      {
        uri: makeActionURI("searchengine", {
          engineName: ENGINE_NAME,
          input: "localhost other foo",
          searchQuery: "localhost other",
          searchSuggestion: "localhost other foo",
        }),
        title: ENGINE_NAME,
        style: ["action", "searchengine", "suggestion"],
        icon: "",
      },
      {
        uri: makeActionURI("searchengine", {
          engineName: ENGINE_NAME,
          input: "localhost other bar",
          searchQuery: "localhost other",
          searchSuggestion: "localhost other bar",
        }),
        title: ENGINE_NAME,
        style: ["action", "searchengine", "suggestion"],
        icon: "",
      },
    ],
  });

  Services.prefs.clearUserPref("browser.fixup.dns_first_for_single_words");

  await check_autocomplete({
    search: "1.2.3.4",
    searchParam: "enable-actions",
    matches: [
      makeVisitMatch("1.2.3.4", "http://1.2.3.4/", { heuristic: true }),
    ],
  });
  await check_autocomplete({
    search: "[2001::1]:30",
    searchParam: "enable-actions",
    matches: [
      makeVisitMatch("[2001::1]:30", "http://[2001::1]:30/", {
        heuristic: true,
      }),
    ],
  });
  await check_autocomplete({
    search: "user:pass@test",
    searchParam: "enable-actions",
    matches: [
      makeVisitMatch("user:pass@test", "http://user:pass@test/", {
        heuristic: true,
      }),
    ],
  });
  await check_autocomplete({
    search: "test/test",
    searchParam: "enable-actions",
    matches: [
      makeVisitMatch("test/test", "http://test/test", { heuristic: true }),
    ],
  });
  await check_autocomplete({
    search: "data:text/plain,Content",
    searchParam: "enable-actions",
    matches: [
      makeVisitMatch("data:text/plain,Content", "data:text/plain,Content", {
        heuristic: true,
      }),
    ],
  });

  await check_autocomplete({
    search: "a",
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch("a", { engineName: ENGINE_NAME, heuristic: true }),
    ],
  });

  await cleanUpSuggestions();
});

add_task(async function avoid_url_suggestions() {
  Services.prefs.setBoolPref(SUGGEST_PREF, true);

  setSuggestionsFn(searchStr => {
    let suffixes = [".com", "/test", ":1]", "@test", ". com"];
    return suffixes.map(s => searchStr + s);
  });

  await check_autocomplete({
    search: "test",
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch("test", { engineName: ENGINE_NAME, heuristic: true }),
      {
        uri: makeActionURI("searchengine", {
          engineName: ENGINE_NAME,
          input: "test. com",
          searchQuery: "test",
          searchSuggestion: "test. com",
        }),
        title: ENGINE_NAME,
        style: ["action", "searchengine", "suggestion"],
        icon: "",
      },
    ],
  });

  await cleanUpSuggestions();
});

add_task(async function avoid_http_url_suggestions() {
  Services.prefs.setBoolPref(SUGGEST_PREF, true);
  Services.prefs.setBoolPref("browser.urlbar.autoFill", false);

  setSuggestionsFn(searchStr => {
    return [searchStr + "ed"];
  });

  await check_autocomplete({
    search: "htt",
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch("htt", { engineName: ENGINE_NAME, heuristic: true }),
      {
        uri: makeActionURI("searchengine", {
          engineName: ENGINE_NAME,
          input: "htted",
          searchQuery: "htt",
          searchSuggestion: "htted",
        }),
        title: ENGINE_NAME,
        style: ["action", "searchengine", "suggestion"],
        icon: "",
      },
    ],
  });

  await check_autocomplete({
    search: "ftp",
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch("ftp", { engineName: ENGINE_NAME, heuristic: true }),
    ],
  });

  await check_autocomplete({
    search: "http",
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch("http", { engineName: ENGINE_NAME, heuristic: true }),
    ],
  });

  await check_autocomplete({
    search: "https",
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch("https", { engineName: ENGINE_NAME, heuristic: true }),
    ],
  });

  await check_autocomplete({
    search: "httpd",
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch("httpd", { engineName: ENGINE_NAME, heuristic: true }),
      {
        uri: makeActionURI("searchengine", {
          engineName: ENGINE_NAME,
          input: "httpded",
          searchQuery: "httpd",
          searchSuggestion: "httpded",
        }),
        title: ENGINE_NAME,
        style: ["action", "searchengine", "suggestion"],
        icon: "",
      },
    ],
  });

  await check_autocomplete({
    search: "http:",
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch("http:", { engineName: ENGINE_NAME, heuristic: true }),
    ],
  });

  await check_autocomplete({
    search: "https:",
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch("https:", { engineName: ENGINE_NAME, heuristic: true }),
    ],
  });

  // Check FTP enabled
  Services.prefs.setBoolPref("network.ftp.enabled", true);
  registerCleanupFunction(() =>
    Services.prefs.clearUserPref("network.ftp.enabled")
  );

  await check_autocomplete({
    search: "ftp:",
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch("ftp:", { engineName: ENGINE_NAME, heuristic: true }),
    ],
  });

  await check_autocomplete({
    search: "ftp:/",
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch("ftp:/", { engineName: ENGINE_NAME, heuristic: true }),
    ],
  });

  await check_autocomplete({
    search: "ftp://",
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch("ftp://", { engineName: ENGINE_NAME, heuristic: true }),
    ],
  });

  // This is still a valid ftp URL even if FTP support is disabled.
  await check_autocomplete({
    search: "ftp://test",
    searchParam: "enable-actions",
    matches: [
      {
        uri: makeActionURI("visiturl", {
          url: "ftp://test/",
          input: "ftp://test",
        }),
        style: ["action", "visiturl", "heuristic"],
        title: "ftp://test/",
      },
    ],
  });

  // Check FTP disabled
  Services.prefs.setBoolPref("network.ftp.enabled", false);
  await check_autocomplete({
    search: "ftp:",
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch("ftp:", { engineName: ENGINE_NAME, heuristic: true }),
    ],
  });

  await check_autocomplete({
    search: "ftp:/",
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch("ftp:/", { engineName: ENGINE_NAME, heuristic: true }),
    ],
  });

  await check_autocomplete({
    search: "ftp://",
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch("ftp://", { engineName: ENGINE_NAME, heuristic: true }),
    ],
  });

  await check_autocomplete({
    search: "ftp://test",
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch("ftp://test", {
        engineName: ENGINE_NAME,
        heuristic: true,
      }),
    ],
  });

  await check_autocomplete({
    search: "http:/",
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch("http:/", { engineName: ENGINE_NAME, heuristic: true }),
    ],
  });

  await check_autocomplete({
    search: "https:/",
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch("https:/", { engineName: ENGINE_NAME, heuristic: true }),
    ],
  });

  await check_autocomplete({
    search: "http://",
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch("http://", { engineName: ENGINE_NAME, heuristic: true }),
    ],
  });

  await check_autocomplete({
    search: "https://",
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch("https://", { engineName: ENGINE_NAME, heuristic: true }),
    ],
  });

  await check_autocomplete({
    search: "http://www",
    searchParam: "enable-actions",
    matches: [
      {
        uri: makeActionURI("visiturl", {
          url: "http://www/",
          input: "http://www",
        }),
        style: ["action", "visiturl", "heuristic"],
        title: "http://www/",
      },
    ],
  });

  await check_autocomplete({
    search: "https://www",
    searchParam: "enable-actions",
    matches: [
      {
        uri: makeActionURI("visiturl", {
          url: "https://www/",
          input: "https://www",
        }),
        style: ["action", "visiturl", "heuristic"],
        title: "https://www/",
      },
    ],
  });

  await check_autocomplete({
    search: "http://test",
    searchParam: "enable-actions",
    matches: [
      {
        uri: makeActionURI("visiturl", {
          url: "http://test/",
          input: "http://test",
        }),
        style: ["action", "visiturl", "heuristic"],
        title: "http://test/",
      },
    ],
  });

  await check_autocomplete({
    search: "https://test",
    searchParam: "enable-actions",
    matches: [
      {
        uri: makeActionURI("visiturl", {
          url: "https://test/",
          input: "https://test",
        }),
        style: ["action", "visiturl", "heuristic"],
        title: "https://test/",
      },
    ],
  });

  await check_autocomplete({
    search: "http://www.test",
    searchParam: "enable-actions",
    matches: [
      {
        uri: makeActionURI("visiturl", {
          url: "http://www.test/",
          input: "http://www.test",
        }),
        style: ["action", "visiturl", "heuristic"],
        title: "http://www.test/",
      },
    ],
  });

  await cleanUpSuggestions();
});

add_task(async function historicalSuggestion() {
  Services.prefs.setBoolPref(SUGGEST_PREF, true);
  Services.prefs.setBoolPref(SUGGEST_ENABLED_PREF, true);
  Services.prefs.setIntPref("browser.urlbar.maxHistoricalSearchSuggestions", 1);

  await check_autocomplete({
    search: "hello",
    searchParam: "enable-actions",
    matches: [
      makeSearchMatch("hello", { engineName: ENGINE_NAME, heuristic: true }),
      {
        uri: makeActionURI("searchengine", {
          engineName: ENGINE_NAME,
          input: "hello Barney!",
          searchQuery: "hello",
          searchSuggestion: "hello Barney!",
        }),
        title: ENGINE_NAME,
        style: ["action", "searchengine", "suggestion"],
        icon: "",
      },
      {
        uri: makeActionURI("searchengine", {
          engineName: ENGINE_NAME,
          input: "hello foo",
          searchQuery: "hello",
          searchSuggestion: "hello foo",
        }),
        title: ENGINE_NAME,
        style: ["action", "searchengine", "suggestion"],
        icon: "",
      },
      {
        uri: makeActionURI("searchengine", {
          engineName: ENGINE_NAME,
          input: "hello bar",
          searchQuery: "hello",
          searchSuggestion: "hello bar",
        }),
        title: ENGINE_NAME,
        style: ["action", "searchengine", "suggestion"],
        icon: "",
      },
    ],
  });

  await cleanUpSuggestions();
  Services.prefs.clearUserPref("browser.urlbar.maxHistoricalSearchSuggestions");
});

function updateSearchHistory(op, value) {
  return new Promise((resolve, reject) => {
    FormHistory.update(
      { op, fieldname: "searchbar-history", value },
      {
        handleError(error) {
          do_throw("Error occurred updating form history: " + error);
          reject(error);
        },
        handleCompletion(reason) {
          reason ? reject(reason) : resolve();
        },
      }
    );
  });
}
