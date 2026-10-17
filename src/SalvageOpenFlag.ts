/** 正式路径恒 false；仅 Vite SSR 开态夹具图可由 resolve/load 内存注入 true。夹具不授权 soft-open。 */
export function isSalvageOpenForFixture(): boolean { return false; }
