import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
export const salvageProgressBase = 'a9ab2aa6e73dca631b6ed28f672d490b61525610c609df478e2c112a66358d3c';
export const salvageProgressAuthorizedAdditions = [
  "import { isValidSalvageProgress, type SalvageProgress } from './SalvageProgress';\n",
  "  if (has('salvage') && !isValidSalvageProgress(saved.salvage)) return false;\n",
  '  /** 仅 SSR 开态夹具完整提交产生；缺字段旧档保持 undefined，读档不补做。 */\n' +
    '  salvage: SalvageProgress | undefined = undefined;\n',
];
export function stripSalvageOpenProgress(source, eq = assert.deepEqual) {
  for (const addition of salvageProgressAuthorizedAdditions) {
    eq(source.split(addition).length - 1, 1, 'Salvage 可选袋最小授权行精确一次');
    source = source.replace(addition, '');
  }
  eq(createHash('sha256').update(source).digest('hex'), salvageProgressBase,
    '仅剥本窗四行恢复 5d9fa29 Progress 完整字节；历史事实承载及业务实现保持');
  return source;
}
