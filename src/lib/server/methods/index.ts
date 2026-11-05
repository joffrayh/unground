import type { BrewMethod } from '../../domain/vocab';
import type { MethodModule } from './types';
import { v60 } from './v60';

/** The brew-method registry: exactly one module per value of BREW_METHODS (the compiler enforces it). */
export const METHODS = {
	v60
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
} satisfies Record<BrewMethod, MethodModule<any>>;
