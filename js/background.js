importScripts("./map.js");

/**
 * Creates a rule for a built-in shortcut when a query is provided (e.g., m/test).
 * @returns {object} A single rule object.
 */
function createBuiltInQueryRule(key, destination, query, id) {
	let redirectUrl;
	if (query.includes("%s")) {
		redirectUrl = (destination + query).replace("%s", "\\1");
	} else {
		redirectUrl = `${destination + query}\\1`;
	}
	return {
		id: id,
		priority: 2,
		action: { type: "redirect", redirect: { regexSubstitution: redirectUrl } },
		condition: {
			regexFilter: `^https?://${key}/(.+)`,
			resourceTypes: ["main_frame"],
		},
	};
}

/**
 * Creates a base redirect rule for a built-in shortcut.
 * This handles both simple cases (without query) and the base case for shortcuts with queries.
 * @returns {object} A single rule object.
 */
function createBuiltInBaseRule(key, destination, id) {
	return {
		id: id,
		priority: 1,
		action: { type: "redirect", redirect: { url: destination } },
		condition: { urlFilter: `||${key}/`, resourceTypes: ["main_frame"] },
	};
}

/**
 * Creates a single rule for a user-defined go/ shortcut.
 * @returns {object} A single rule object.
 */
function createUserGoRule(key, destination, id) {
	const shortcut = key.substring(3); // remove "go-"
	return {
		id: id,
		priority: 2,
		action: {
			type: "redirect",
			redirect: {
				url: destination.startsWith("http")
					? destination
					: `http://${destination}`,
			},
		},
		condition: { urlFilter: `||go/${shortcut}`, resourceTypes: ["main_frame"] },
	};
}

/**
 * Creates the default rule for the main go/ page.
 * @returns {object} A single rule object.
 */
function createGoMainMenuRule(id) {
	return {
		id: id,
		priority: 1,
		action: {
			type: "redirect",
			redirect: { url: chrome.runtime.getURL("go_all.html") },
		},
		condition: {
			regexFilter: "^https?://go/?$",
			resourceTypes: ["main_frame"],
		},
	};
}

/**
 * Creates the default rule for creating new go/ links.
 * @returns {object} A single rule object.
 */
function createGoLinkCreationRule(id) {
	return {
		id: id,
		priority: 1,
		action: {
			type: "redirect",
			redirect: { regexSubstitution: chrome.runtime.getURL("go.html?q=\\1") },
		},
		condition: {
			regexFilter: "^https?://go/(.+)",
			resourceTypes: ["main_frame"],
		},
	};
}

/**
 * Main function to build and register all dynamic redirect rules.
 */
async function buildAndRegisterRules() {
	const rules = [];
	let ruleIdCounter = 1;
	const data = await chrome.storage.sync.get(null);
	const activeMappings = { ...defaultMap, ...data };

	for (const key in activeMappings) {
		const destination = activeMappings[key];
		if (key.startsWith("go-")) {
			rules.push(createUserGoRule(key, destination, ruleIdCounter++));
			continue;
		}

		if (key in defaultMap && !key.endsWith("-q")) {
			const query = activeMappings[`${key}-q`];
			rules.push(createBuiltInBaseRule(key, destination, ruleIdCounter++));

			if (query) {
				rules.push(
					createBuiltInQueryRule(key, destination, query, ruleIdCounter++),
				);
			}
		}
	}

	rules.push(createGoMainMenuRule(ruleIdCounter++));
	rules.push(createGoLinkCreationRule(ruleIdCounter++));

	const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
	const existingRuleIds = existingRules.map((rule) => rule.id);

	await chrome.declarativeNetRequest.updateDynamicRules({
		removeRuleIds: existingRuleIds,
		addRules: rules,
	});

	console.log("Redirect rules have been updated. Total rules:", rules.length);
}

chrome.runtime.onInstalled.addListener(buildAndRegisterRules);
chrome.runtime.onStartup.addListener(buildAndRegisterRules);
chrome.storage.onChanged.addListener((changes, namespace) => {
	if (namespace === "sync") {
		console.log("Storage changed, rebuilding rules...");
		buildAndRegisterRules();
	}
});
