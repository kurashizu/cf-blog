import { writable } from 'svelte/store';
import { MODULES } from '../data/modules';

export const selectedModuleId = writable<string>(MODULES[0].id);
