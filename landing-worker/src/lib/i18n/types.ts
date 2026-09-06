/** One flat dictionary per locale. Keys are `area.section.name`, values may hold `{placeholders}`. */
export type Dict = Record<string, string>;
export type Messages = { en: Dict; 'zh-CN': Dict; 'zh-TW': Dict; ja: Dict; ko: Dict };
