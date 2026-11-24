// Static hosts serve the public game. The internal dev server overrides this
// module on both comparison routes. Local file imports also power data tooling.
export const publicBuild = ['http:', 'https:', 'concrete:'].includes(new URL(import.meta.url).protocol);
