/**
 * The core journey, in a real browser (phone viewport) against a production build:
 * sign up → set up a grinder, a bean and a dripper from the brew form → log a brew → rate it on the
 * radar → plan what to change → brew again (placeholders + the plan's suggestions) → export. Plus the
 * same logging flow with JavaScript disabled. The theme choice is covered both ways.
 */
import { expect, test, type Page } from '@playwright/test';
import { fillPours, isoDate, logIn, signUp, uniqueEmail } from './helpers';

/** CSV rows as objects (the export never quotes the fields this test reads). */
function csvRows(text: string): Record<string, string>[] {
	const [header, ...lines] = text.trim().split('\r\n');
	const cols = header.split(',');
	return lines.map((line) => Object.fromEntries(line.split(',').map((v, i) => [cols[i], v])));
}

/** Sign-ups are rate limited and the journeys use them all, so the theme tests reuse an account. */
const THEME_EMAIL = uniqueEmail('theme');
const LIGHT_BG = 'rgb(250, 245, 236)';
const DARK_BG = 'rgb(16, 17, 24)';

/** Picks each theme against the device's setting, checking the choice survives a reload. */
async function checkThemeChoice(page: Page) {
	const background = (colour: string) =>
		expect(page.locator('body')).toHaveCSS('background-color', colour);
	const choose = async (name: string) => {
		const button = page.getByRole('button', { name, exact: true });
		await button.click();
		await expect(button).toHaveAttribute('aria-pressed', 'true');
	};

	await page.emulateMedia({ colorScheme: 'light' });
	await logIn(page, THEME_EMAIL);
	await page.goto('/settings');
	await background(LIGHT_BG);

	await choose('Dark');
	await background(DARK_BG);
	await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#101118');
	await page.reload();
	await background(DARK_BG);

	await page.emulateMedia({ colorScheme: 'dark' });
	await choose('Light');
	await background(LIGHT_BG);

	await choose('System');
	await background(DARK_BG);
	await expect(page.locator('meta[name="theme-color"]')).toHaveCount(2);
}

async function setUpGrinderAndBean(page: Page, { js = true } = {}) {
	const main = page.getByRole('main');
	await page.goto('/brews/new');
	// A brand-new user is guided to set up equipment first, and returned to the brew form after each step.
	await main
		.getByRole('link', { name: /grinder/i })
		.first()
		.click();
	await expect(page).toHaveURL(/\/equipment\?return=/);
	await page.locator('#new-grinder-name').fill('E2E Comandante');
	await page.locator('#new-grinder-unit').fill('clicks');
	await page.getByRole('button', { name: 'Add grinder' }).click();
	await expect(page).toHaveURL(/\/brews\/new\?.*grinder=/);

	await main.getByRole('link', { name: /bean/i }).first().click();
	await expect(page).toHaveURL(/\/beans\/new\?return=/);
	await page.locator('[name="name"]').fill('E2E Kochere');
	await page.locator('[name="roasterName"]').fill('E2E Roasters');
	await page.locator('[name="country"]').selectOption('ET');
	await page.locator('[name="process"]').selectOption('washed');
	await page.locator('[name="roastLevel"]').selectOption('light');
	await page.locator('[name="roastDate"]').fill(isoDate(10));
	await page.locator('[name="bagWeightG"]').fill('250');
	if (js) {
		// Tag search is a JS enhancement (without JS the notes are checkboxes under "Browse all").
		const notes = page.getByRole('combobox', { name: /tasting notes/i });
		await notes.fill('peach');
		await expect(page.getByRole('option', { name: /^Peach/ })).toBeVisible();
		await notes.press('Enter');
		await expect(page.getByRole('button', { name: 'Remove Peach' })).toBeVisible();
	}
	await page.getByRole('button', { name: 'Save bean' }).click();
	await expect(page).toHaveURL(/\/brews\/new\?.*bean=/);
}

async function logBrew(page: Page) {
	await page.locator('[name="grindSetting"]').fill('24');
	await page.locator('[name="doseG"]').fill('15');
	await page.locator('[name="waterTempC"]').fill('94');
	await fillPours(page, [
		['0:00', '50'],
		['0:45', '150'],
		['1:15', '250']
	]);
	await page.locator('[name="totalTime"]').fill('3:15');
	await page.getByRole('button', { name: 'Save brew' }).click();
	await expect(page).toHaveURL(/\/brews\/[0-9a-f-]{36}$/);
}

test('signed-out visitors are sent to log in, keeping where they were going', async ({ page }) => {
	await page.goto('/brews');
	await expect(page).toHaveURL('/login?next=%2Fbrews');
	const res = await page.request.get('/export/brews.csv', { maxRedirects: 0 });
	expect(res.status()).toBe(303);
});

test('log, rate, plan, repeat and export a brew', async ({ page }) => {
	await signUp(page, uniqueEmail('flow'));
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

	await setUpGrinderAndBean(page);

	// The dripper is added from the set-up card like a grinder, and comes back selected.
	await page.getByRole('main').getByRole('link', { name: '+ Add a dripper' }).click();
	await expect(page).toHaveURL(/\/equipment\?return=/);
	await page.locator('#new-dripper-name').fill('E2E V60 02');
	await page.locator('#new-dripper-material').selectOption('plastic');
	await page.getByRole('button', { name: 'Add dripper' }).click();
	await expect(page).toHaveURL(/\/brews\/new\?.*dripper=/);
	await expect(page.locator('[name="dripperId"] option:checked')).toHaveText('E2E V60 02');

	// A first brew starts with pour 0 ticked as the bloom; agitation defaults to 3.
	await expect(page.locator('input[name="pourBloom"]').first()).toBeChecked();
	await expect(page.locator('input[name="agitation"][value="3"]')).toBeChecked();
	await expect(page.getByText('What changed')).toHaveCount(0);

	await logBrew(page);
	const brewUrl = page.url();
	await expect(page.getByText('E2E Kochere').first()).toBeVisible();
	await expect(page.getByText('1:16.7')).toBeVisible();
	await expect(page.getByText('250 g').first()).toBeVisible();

	// Rate it afterwards, the sub-scores on the radar.
	await page.locator('input[name="overall"][value="8"]').check();
	const acidity = page.getByRole('slider', { name: 'Acidity intensity' });
	await acidity.focus();
	await acidity.press('End');
	for (let i = 0; i < 3; i++) await acidity.press('ArrowDown');
	await expect(acidity).toHaveAttribute('aria-valuenow', '7');
	// Tasting notes are tags picked from a search; a tap on a match adds it.
	await page.getByRole('combobox', { name: /tasting notes/i }).fill('blueb');
	await page.getByRole('option', { name: /^Blueberry/ }).click();
	await page.getByRole('button', { name: 'Save rating' }).first().click();
	await expect(page.getByLabel('Overall 8 of 10')).toBeVisible();
	// (The edit form further down holds the same name, folded away.)
	await expect(page.getByText('Blueberry', { exact: true }).first()).toBeVisible();

	// Plan the next one: ratio 1:16.7 → 1:17, grind 24 → 25, 3 → 4 pours, agitation 3 → 4.
	const next = page.locator('#next');
	await next.getByRole('button', { name: 'Raise ratio' }).click();
	await expect(next.locator('[name="nextRatio"]')).toHaveValue('17');
	await next.getByRole('button', { name: 'Raise grind setting' }).click();
	await next.getByRole('button', { name: 'Raise number of pours' }).click();
	await next.getByRole('button', { name: 'Raise agitation' }).click();
	await next.getByRole('button', { name: 'Save plan' }).click();
	await expect(next.getByText('24 → 25')).toBeVisible();

	// Brew again: the recipe shows as placeholders, the plan as green suggestions (D25, D26).
	await page.getByRole('link', { name: 'Brew again' }).click();
	await expect(page).toHaveURL(/\/brews\/new\?from=/);
	const dose = page.locator('[name="doseG"]');
	await expect(dose).toHaveValue('');
	await expect(dose).toHaveAttribute('placeholder', '15');
	await expect(page.locator('[name="pourScale"]').nth(2)).toHaveAttribute('placeholder', '250');
	await expect(page.locator('[name="totalTime"]')).toHaveValue('');
	await expect(page.locator('input[name="overall"]:checked')).toHaveValue('');
	await expect(page.locator('[name="dripperId"] option:checked')).toHaveText('E2E V60 02');

	await page.getByRole('button', { name: 'Use 25 clicks, as planned last time' }).click();
	await expect(page.locator('[name="grindSetting"]')).toHaveValue('25');
	// The planned agitation level is highlighted, not picked.
	await expect(page.getByRole('radio', { name: '4, as planned last time' })).not.toBeChecked();

	// The pour card offers the reshaped pours: one added (green), the water at 1:17.
	await expect(page.getByLabel('Suggested pour 3')).toBeVisible();
	// A reading typed before accepting survives it.
	await page.locator('[name="pourTime"]').nth(1).fill('0:45');
	await page.getByRole('button', { name: 'Accept' }).click();
	await expect(page.locator('[name="pourTime"]').nth(1)).toHaveValue('0:45');
	await expect(page.getByText(/Plan applied/)).toBeVisible();
	// A new dose reshapes the plan, so it is offered again; back to 15 g it is applied as it was.
	await dose.fill('20');
	await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible();
	await expect(page.getByText('› 340 g', { exact: true })).toBeVisible();
	await dose.fill('');
	await expect(page.getByText(/Plan applied/)).toBeVisible();
	const scales = page.locator('[name="pourScale"]');
	await expect(scales).toHaveCount(4);
	expect(await scales.evaluateAll((els) => els.map((e) => e.getAttribute('placeholder')))).toEqual([
		'50',
		'119',
		'187',
		'255'
	]);
	await expect(page.getByText('Ratio 1:17')).toBeVisible();

	// Only the measurements are typed; blank fields save their placeholders.
	await page.locator('[name="totalTime"]').fill('3:30');
	await page.getByRole('button', { name: 'Save brew' }).click();
	await expect(page).toHaveURL(/\/brews\/[0-9a-f-]{36}$/);
	const secondUrl = page.url();
	await expect(page.getByText('1:17', { exact: true })).toBeVisible();

	// Export carries both brews with derived values, the plan and the new columns.
	const brews = csvRows(await (await page.request.get('/export/brews.csv')).text());
	expect(brews).toHaveLength(2);
	// Both brews are logged within the same minute, so find them by id rather than by order.
	const firstId = brewUrl.split('/').pop();
	const secondId = secondUrl.split('/').pop();
	const byId = (id: string | undefined) => brews.find((b) => b.brew_id === id);
	expect(byId(firstId)).toMatchObject({
		bean_name: 'E2E Kochere',
		roaster_name: 'E2E Roasters',
		country: 'ET',
		roast_age_days: '10',
		bag_weight_g: '250',
		dripper_name: 'E2E V60 02',
		dripper_material: 'plastic',
		dose_g: '15',
		water_g: '250',
		ratio: '16.7',
		agitation: '3',
		pour_count: '3',
		bloom_pours: '1',
		bloom_time_s: '45',
		changed: '',
		rating_overall: '8',
		rating_acidity: '7',
		rating_sweetness: '',
		roaster_notes: 'fruity.other_fruit.peach',
		next_ratio: '17',
		next_grind_setting: '25',
		next_pour_count: '4',
		next_agitation: '4',
		next_water_temp_c: '',
		perceived_notes: 'fruity.berry.blueberry'
	});
	expect(byId(secondId)).toMatchObject({
		grind_setting: '25',
		dose_g: '15',
		water_temp_c: '94',
		water_g: '255',
		ratio: '17',
		pour_count: '4',
		bloom_pours: '1',
		dripper_name: 'E2E V60 02'
	});
	const pours = csvRows(await (await page.request.get('/export/pours.csv')).text());
	const poursOf = (id: string | undefined) => pours.filter((p) => p.brew_id === id);
	expect(poursOf(firstId).map((p) => [p.pour_number, p.cumulative_g, p.bloom])).toEqual([
		['0', '50', 'true'],
		['1', '150', 'false'],
		['2', '250', 'false']
	]);
	expect(poursOf(secondId).map((p) => [p.pour_number, p.cumulative_g, p.bloom])).toEqual([
		['0', '50', 'true'],
		['1', '119', 'false'],
		['2', '187', 'false'],
		['3', '255', 'false']
	]);
	// The home screen tracks the bag: 250 g − 2 × 15 g, brews left at the latest dose.
	await page.goto('/');
	const bags = page.getByRole('region', { name: 'Your beans' });
	await expect(bags.getByText('E2E Kochere')).toBeVisible();
	await expect(bags.getByText(/220 g left/)).toBeVisible();
	await expect(bags.getByText(/14 brews/)).toBeVisible();
});

test('brew again survives a new-grinder detour, and never copies grind across grinders', async ({
	page
}) => {
	await signUp(page, uniqueEmail('detour'));
	await setUpGrinderAndBean(page);
	await logBrew(page);
	await page.getByRole('link', { name: 'Brew again' }).click();
	await expect(page).toHaveURL(/\/brews\/new\?from=/);
	const copyUrl = page.url();

	// Enter/Go on the phone keyboard moves on instead of saving a half-filled brew.
	await page.locator('[name="doseG"]').press('Enter');
	await expect(page.locator('[name="waterTempC"]')).toBeFocused();
	expect(page.url()).toBe(copyUrl);

	await page.getByRole('main').getByRole('link', { name: '+ Add a grinder' }).click();
	await page.locator('#new-grinder-name').fill('E2E Dial grinder');
	await page.locator('#new-grinder-unit').fill('dial');
	await page.getByRole('button', { name: 'Add grinder' }).click();

	// Back on the same copy (from= kept), with the new grinder selected and no grind placeholder.
	await expect(page).toHaveURL(/\/brews\/new\?from=[0-9a-f-]+&grinder=/);
	await expect(page.locator('[name="doseG"]')).toHaveAttribute('placeholder', '15');
	await expect(page.locator('[name="grindSetting"]')).toHaveValue('');
	await expect(page.locator('[name="grindSetting"]')).toHaveAttribute('placeholder', '');
	await expect(page.getByText(/different grinder/)).toBeVisible();
});

test('a blank pour time saves the time it shows, and the brew page leads back to the list', async ({
	page
}) => {
	await signUp(page, THEME_EMAIL);
	await setUpGrinderAndBean(page);
	await page.locator('[name="grindSetting"]').fill('24');
	await page.locator('[name="doseG"]').fill('15');
	await page.locator('[name="waterTempC"]').fill('94');
	// Only scale readings: the start times are estimated 0:45 apart and shown as placeholders.
	const times = page.locator('[name="pourTime"]');
	const scales = page.locator('[name="pourScale"]');
	await scales.nth(0).fill('50');
	await scales.nth(1).fill('150');
	await scales.nth(2).fill('250');
	await expect(times.nth(1)).toHaveAttribute('placeholder', '0:45');
	await expect(times.nth(2)).toHaveAttribute('placeholder', '1:30');
	await page.locator('[name="totalTime"]').fill('3:00');
	await page.getByRole('button', { name: 'Save brew' }).click();
	await expect(page).toHaveURL(/\/brews\/[0-9a-f-]{36}$/);
	await expect(page.getByRole('cell', { name: '0:45' })).toBeVisible();
	await expect(page.getByRole('cell', { name: '1:30' })).toBeVisible();

	await page.getByRole('main').getByRole('link', { name: 'Brews' }).click();
	await expect(page).toHaveURL('/brews');
});

test('choosing a theme', async ({ page }) => {
	await checkThemeChoice(page);
});

test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('choosing a theme', async ({ page }) => {
		await checkThemeChoice(page);
	});

	test('a first brew saves with only scale readings, at the estimated times', async ({ page }) => {
		await signUp(page, uniqueEmail('nojs-times'));
		await setUpGrinderAndBean(page, { js: false });
		await page.locator('[name="grindSetting"]').fill('22');
		await page.locator('[name="doseG"]').fill('15');
		await page.locator('[name="waterTempC"]').fill('93');
		const times = page.locator('[name="pourTime"]');
		await expect(times.nth(1)).toHaveAttribute('placeholder', '0:45');
		await expect(times.nth(2)).toHaveAttribute('placeholder', '1:30');
		await page.locator('[name="pourScale"]').nth(0).fill('50');
		await page.locator('[name="pourScale"]').nth(1).fill('150');
		await page.locator('[name="pourScale"]').nth(2).fill('250');
		await page.locator('[name="totalTime"]').fill('3:00');
		await page.getByRole('button', { name: 'Save brew' }).click();
		await expect(page).toHaveURL(/\/brews\/[0-9a-f-]{36}$/);
		await expect(page.getByRole('cell', { name: '0:45' })).toBeVisible();
		await expect(page.getByRole('cell', { name: '1:30' })).toBeVisible();
	});

	test('a failed submit keeps the input, and the fixed brew saves', async ({ page }) => {
		const email = uniqueEmail('nojs');
		await signUp(page, email);
		await setUpGrinderAndBean(page, { js: false });

		await page.locator('[name="grindSetting"]').fill('22');
		// Dose left blank on purpose.
		await page.locator('[name="waterTempC"]').fill('93');
		await page.locator('[name="pourScale"]').nth(0).fill('45');
		await page.locator('[name="pourTime"]').nth(1).fill('0:40');
		await page.locator('[name="pourScale"]').nth(1).fill('240');
		await page.locator('[name="totalTime"]').fill('3:00');
		await page.getByRole('button', { name: 'Save brew' }).click();

		await expect(page.getByRole('alert').first()).toBeVisible();
		await expect(page.locator('[name="doseG"]')).toHaveAttribute('aria-invalid', 'true');
		await expect(page.locator('[name="grindSetting"]')).toHaveValue('22');
		await expect(page.locator('[name="pourScale"]').nth(1)).toHaveValue('240');
		await expect(page.locator('[name="totalTime"]')).toHaveValue('3:00');

		await page.locator('[name="doseG"]').fill('15');
		await page.getByRole('button', { name: 'Save brew' }).click();
		await expect(page).toHaveURL(/\/brews\/[0-9a-f-]{36}$/);
		await expect(page.getByText('1:16', { exact: true })).toBeVisible();

		// Brew again without JavaScript: blank fields save last brew's values (D26).
		await page.getByRole('link', { name: 'Brew again' }).click();
		await expect(page.locator('[name="doseG"]')).toHaveAttribute('placeholder', '15');
		await page.locator('[name="totalTime"]').fill('3:05');
		await page.getByRole('button', { name: 'Save brew' }).click();
		await expect(page).toHaveURL(/\/brews\/[0-9a-f-]{36}$/);
		await expect(page.getByText('240 g').first()).toBeVisible();

		// ...and a placeholder pour can be left out with its "drop" box.
		await page.getByRole('link', { name: 'Brew again' }).click();
		await page.getByLabel('Leave out pour 1').check();
		await page.locator('[name="totalTime"]').fill('2:30');
		await page.getByRole('button', { name: 'Save brew' }).click();
		await expect(page).toHaveURL(/\/brews\/[0-9a-f-]{36}$/);
		// Only pour 0 (45 g) is left.
		await expect(page.getByRole('cell', { name: 'Pour 1' })).toHaveCount(0);
		await expect(page.getByText('1:3', { exact: true })).toBeVisible();

		// Signing in again (fresh session) shows the brew in the list.
		await page.context().clearCookies();
		await logIn(page, email);
		await page.goto('/brews');
		await expect(page.getByRole('main').getByText('E2E Kochere').first()).toBeVisible();
	});
});
