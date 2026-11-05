<script lang="ts" module>
	/** The stored bean's values (edit), matching the fields of the `Bean` service type. */
	export interface BeanDefaults {
		name: string;
		roasterName: string;
		country: string | null;
		farm: string | null;
		altitudeMinM: number | null;
		altitudeMaxM: number | null;
		process: string | null;
		roastLevel: string | null;
		roastDate: string | null;
		decaf: boolean;
		storedFrozen: boolean;
		roasterNotesRaw: string | null;
		roasterNotes: readonly string[];
		bagWeightG: number | null;
		bagPrice: number | null;
	}
</script>

<script lang="ts">
	/**
	 * The bean form, shared by "new" and "edit". Field names are the ones `parseBeanForm` reads.
	 * Grouped into origin / process / roast fieldsets (D4), plus the bag (D28). Works without JavaScript.
	 */
	import { enhance } from '$app/forms';
	import FieldError from '#lib/components/FieldError.svelte';
	import FormError from '#lib/components/FormError.svelte';
	import TagPicker from '#lib/components/TagPicker.svelte';
	import { COUNTRIES, PROCESSES, ROAST_LEVELS } from '#lib/domain/vocab.ts';
	import { options } from '#lib/ui/format.ts';
	import { checked, err, val, vals, type FormState } from '#lib/ui/forms.ts';

	let {
		form,
		bean = null,
		roasters,
		today,
		action,
		submitLabel,
		cancelHref
	}: {
		form: FormState;
		bean?: BeanDefaults | null;
		/** The user's roaster names, offered as suggestions; typing a new name creates one. */
		roasters: readonly string[];
		/** The user's local date (YYYY-MM-DD), the latest allowed roast date. */
		today: string;
		action?: string;
		submitLabel: string;
		cancelHref: string;
	} = $props();

	const uid = $props.id();
	const id = (key: string) => `${uid}-${key}`;
	let submitting = $state(false);

	const countries = Object.entries(COUNTRIES)
		.map(([code, name]) => ({ value: code, label: name }))
		.sort((a, b) => a.label.localeCompare(b.label, 'en'));
	const processes = options(PROCESSES);
	const roastLevels = options(ROAST_LEVELS);

	const country = $derived(val(form, 'country', bean?.country));
	const process = $derived(val(form, 'process', bean?.process));
	const roastLevel = $derived(val(form, 'roastLevel', bean?.roastLevel));

	/** aria-describedby for a field: its error, when shown. */
	const describedBy = (key: string) => (err(form, key) ? id(`${key}-error`) : undefined);
	const invalid = (key: string) => (err(form, key) ? 'true' : undefined);
</script>

<form
	method="POST"
	{action}
	class="stack"
	use:enhance={() => {
		submitting = true;
		return async ({ update }) => {
			await update();
			submitting = false;
		};
	}}
>
	<FormError {form} />

	<div class="field">
		<label for={id('name')}>Bean name</label>
		<input
			id={id('name')}
			name="name"
			required
			maxlength="150"
			autocomplete="off"
			placeholder="e.g. Kochere"
			value={val(form, 'name', bean?.name)}
			aria-invalid={invalid('name')}
			aria-describedby={describedBy('name')}
		/>
		<FieldError id={id('name-error')} message={err(form, 'name')} />
	</div>

	<div class="field">
		<label for={id('roasterName')}>Roaster</label>
		<input
			id={id('roasterName')}
			name="roasterName"
			required
			maxlength="100"
			autocomplete="off"
			list={id('roasters')}
			value={val(form, 'roasterName', bean?.roasterName)}
			aria-invalid={invalid('roasterName')}
			aria-describedby={describedBy('roasterName')}
		/>
		<datalist id={id('roasters')}>
			{#each roasters as name (name)}<option value={name}></option>{/each}
		</datalist>
		<FieldError id={id('roasterName-error')} message={err(form, 'roasterName')} />
	</div>

	<fieldset class="stack">
		<legend>Origin</legend>
		<div class="field">
			<label for={id('country')}>Country</label>
			<select
				id={id('country')}
				name="country"
				aria-invalid={invalid('country')}
				aria-describedby={describedBy('country')}
			>
				<option value="" selected={country === ''}>Unknown</option>
				{#each countries as c (c.value)}
					<option value={c.value} selected={country === c.value}>{c.label}</option>
				{/each}
			</select>
			<FieldError id={id('country-error')} message={err(form, 'country')} />
		</div>

		<div class="field">
			<label for={id('farm')}>Farm / washing station</label>
			<input
				id={id('farm')}
				name="farm"
				maxlength="150"
				autocomplete="off"
				value={val(form, 'farm', bean?.farm)}
				aria-invalid={invalid('farm')}
				aria-describedby={describedBy('farm')}
			/>
			<FieldError id={id('farm-error')} message={err(form, 'farm')} />
		</div>

		<div class="row">
			<div class="field">
				<label for={id('altitudeMinM')}>Altitude min (m)</label>
				<input
					id={id('altitudeMinM')}
					name="altitudeMinM"
					type="text"
					inputmode="numeric"
					autocomplete="off"
					value={val(form, 'altitudeMinM', bean?.altitudeMinM)}
					aria-invalid={invalid('altitudeMinM')}
					aria-describedby={describedBy('altitudeMinM')}
				/>
				<FieldError id={id('altitudeMinM-error')} message={err(form, 'altitudeMinM')} />
			</div>
			<div class="field">
				<label for={id('altitudeMaxM')}>Altitude max (m)</label>
				<input
					id={id('altitudeMaxM')}
					name="altitudeMaxM"
					type="text"
					inputmode="numeric"
					autocomplete="off"
					value={val(form, 'altitudeMaxM', bean?.altitudeMaxM)}
					aria-invalid={invalid('altitudeMaxM')}
					aria-describedby={describedBy('altitudeMaxM')}
				/>
				<FieldError id={id('altitudeMaxM-error')} message={err(form, 'altitudeMaxM')} />
			</div>
		</div>
	</fieldset>

	<fieldset class="stack">
		<legend>Process</legend>
		<div class="field">
			<label for={id('process')}>Processing method</label>
			<select
				id={id('process')}
				name="process"
				aria-invalid={invalid('process')}
				aria-describedby={describedBy('process')}
			>
				<option value="" selected={process === ''}>Unknown</option>
				{#each processes as p (p.value)}
					<option value={p.value} selected={process === p.value}>{p.label}</option>
				{/each}
			</select>
			<FieldError id={id('process-error')} message={err(form, 'process')} />
		</div>
	</fieldset>

	<fieldset class="stack">
		<legend>Roast</legend>
		<div class="row">
			<div class="field">
				<label for={id('roastLevel')}>Roast level</label>
				<select
					id={id('roastLevel')}
					name="roastLevel"
					aria-invalid={invalid('roastLevel')}
					aria-describedby={describedBy('roastLevel')}
				>
					<option value="" selected={roastLevel === ''}>Unknown</option>
					{#each roastLevels as r (r.value)}
						<option value={r.value} selected={roastLevel === r.value}>{r.label}</option>
					{/each}
				</select>
				<FieldError id={id('roastLevel-error')} message={err(form, 'roastLevel')} />
			</div>
			<div class="field">
				<label for={id('roastDate')}>Roast date</label>
				<input
					id={id('roastDate')}
					name="roastDate"
					type="date"
					min="2000-01-01"
					max={today}
					value={val(form, 'roastDate', bean?.roastDate)}
					aria-invalid={invalid('roastDate')}
					aria-describedby={describedBy('roastDate')}
				/>
				<FieldError id={id('roastDate-error')} message={err(form, 'roastDate')} />
			</div>
		</div>

		<div>
			<label class="check">
				<input
					type="checkbox"
					name="decaf"
					checked={checked(form, 'decaf', bean?.decaf ?? false)}
				/>
				Decaf
			</label>
			<label class="check">
				<input
					type="checkbox"
					name="storedFrozen"
					checked={checked(form, 'storedFrozen', bean?.storedFrozen ?? false)}
				/>
				Stored frozen
			</label>
		</div>
	</fieldset>

	<fieldset class="stack">
		<legend>Roaster’s notes</legend>
		<div>
			<TagPicker
				name="roasterNotes"
				label="Roaster's tasting notes"
				selected={vals(form, 'roasterNotes', bean?.roasterNotes ?? [])}
			/>
			<FieldError id={id('roasterNotes-error')} message={err(form, 'roasterNotes')} />
		</div>
		<div class="field">
			<label for={id('roasterNotesRaw')}>As written on the bag</label>
			<textarea
				id={id('roasterNotesRaw')}
				name="roasterNotesRaw"
				maxlength="500"
				rows="2"
				placeholder="e.g. lemon sherbet, jasmine, black tea"
				aria-invalid={invalid('roasterNotesRaw')}
				aria-describedby={describedBy('roasterNotesRaw')}
				value={val(form, 'roasterNotesRaw', bean?.roasterNotesRaw)}></textarea>
			<FieldError id={id('roasterNotesRaw-error')} message={err(form, 'roasterNotesRaw')} />
		</div>
	</fieldset>

	<fieldset class="stack">
		<legend>Bag</legend>
		<div class="row">
			<div class="field">
				<label for={id('bagWeightG')}>Bag weight (g)</label>
				<input
					id={id('bagWeightG')}
					name="bagWeightG"
					type="text"
					inputmode="decimal"
					autocomplete="off"
					placeholder="e.g. 250"
					value={val(form, 'bagWeightG', bean?.bagWeightG)}
					aria-invalid={invalid('bagWeightG')}
					aria-describedby={describedBy('bagWeightG')}
				/>
				<FieldError id={id('bagWeightG-error')} message={err(form, 'bagWeightG')} />
			</div>
			<div class="field">
				<label for={id('bagPrice')}>Price paid</label>
				<input
					id={id('bagPrice')}
					name="bagPrice"
					type="text"
					inputmode="decimal"
					autocomplete="off"
					placeholder="e.g. 14.50"
					value={val(form, 'bagPrice', bean?.bagPrice?.toFixed(2))}
					aria-invalid={invalid('bagPrice')}
					aria-describedby={describedBy('bagPrice')}
				/>
				<FieldError id={id('bagPrice-error')} message={err(form, 'bagPrice')} />
			</div>
		</div>
	</fieldset>

	<div class="actions">
		<button class="btn btn-primary" disabled={submitting}>{submitLabel}</button>
		<a class="btn" href={cancelHref}>Cancel</a>
	</div>
</form>
