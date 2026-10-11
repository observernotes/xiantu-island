// 共享 preview 的缺图自测只改当前浏览器上下文收到的素材清单。
import assert from 'node:assert/strict';
import ts from 'typescript';

const manifestFields = ['atlases', 'areas', 'tileMetadata', 'backgrounds',
  'backgroundConfigs', 'propLayouts', 'skillIcons', 'sectRankIcons', 'uiImages'];

function propertyName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) return node.text;
  throw new Error('素材清单包含非字面量属性名');
}

// Vite 把 JSON 的默认对象编译为引用顶层数组的对象。只解释字面量和这些引用，
// 不执行服务器返回的脚本，也不依赖本工作树的 src/gen/assets.json。
function readLiteral(node, bindings, resolving = new Set()) {
  if (ts.isParenthesizedExpression(node)) return readLiteral(node.expression, bindings, resolving);
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isPrefixUnaryExpression(node)) {
    const value = readLiteral(node.operand, bindings, resolving);
    if (node.operator === ts.SyntaxKind.MinusToken && typeof value === 'number') return -value;
    if (node.operator === ts.SyntaxKind.PlusToken && typeof value === 'number') return value;
    if (node.operator === ts.SyntaxKind.ExclamationToken) return !value;
  }
  if (ts.isArrayLiteralExpression(node))
    return node.elements.map(element => readLiteral(element, bindings, resolving));
  if (ts.isObjectLiteralExpression(node)) {
    return Object.fromEntries(node.properties.map(property => {
      assert.ok(ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property),
        '素材清单包含非字面量对象属性');
      return [propertyName(property.name), readLiteral(
        ts.isPropertyAssignment(property) ? property.initializer : property.name, bindings, resolving)];
    }));
  }
  if (ts.isIdentifier(node)) {
    const initializer = bindings.get(node.text);
    assert.ok(initializer && !resolving.has(node.text), `素材清单引用无法解析：${node.text}`);
    const next = new Set(resolving); next.add(node.text);
    return readLiteral(initializer, bindings, next);
  }
  throw new Error(`素材清单包含非字面量表达式：${ts.SyntaxKind[node.kind]}`);
}

function inspectModule(source, filename) {
  // 其他模块（如 Phaser、测试桥）不含完整清单，不必创建它们的 AST。
  if (!manifestFields.every(field => source.includes(field))) return null;
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
  const bindings = new Map();
  for (const statement of ast.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer)
        bindings.set(declaration.name.text, declaration.initializer);
    }
  }
  const candidates = [];
  let testBridgePresent = false;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0])
      && /(?:^|\/)XtTestBridge[^/]*\.js(?:[?#]|$)/.test(node.arguments[0].text))
      testBridgePresent = true;
    if (ts.isObjectLiteralExpression(node)) {
      const names = new Set(node.properties.filter(property =>
        ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property))
        .map(property => property.name)
        .filter(name => ts.isIdentifier(name) || ts.isStringLiteralLike(name)).map(name => name.text));
      if (manifestFields.every(field => names.has(field))) candidates.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!candidates.length) return null;
  assert.equal(candidates.length, 1, `${filename} 的完整素材清单必须唯一`);
  const node = candidates[0], manifest = readLiteral(node, bindings);
  for (const field of manifestFields) assert.ok(Array.isArray(manifest[field]), `素材清单 ${field} 必须是数组`);
  return { manifest, testBridgePresent, start: node.getStart(ast), end: node.end };
}

async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  assert.ok(response.ok, `读取共享 preview 失败：${response.status} ${url}`);
  return { text: await response.text(), url: response.url };
}

export async function inspectSharedPreview(baseURL) {
  const index = await fetchText(baseURL), modules = [];
  for (const match of index.text.matchAll(/<script\b([^>]*)>/gi)) {
    const attributes = Object.fromEntries([...match[1].matchAll(
      /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g,
    )].map(attribute => [attribute[1].toLowerCase(), attribute[2] ?? attribute[3] ?? attribute[4]]));
    if (attributes.type?.toLowerCase() === 'module' && attributes.src)
      modules.push(new URL(attributes.src.replaceAll('&amp;', '&'), index.url).href);
  }
  assert.ok(modules.length, '共享 preview 的 index.html 缺少模块脚本');
  const inspected = await Promise.all(modules.map(async url => {
    const module = await fetchText(url);
    return inspectModule(module.text, module.url);
  }));
  const manifests = inspected.filter(Boolean);
  assert.equal(manifests.length, 1, '共享 preview 必须包含唯一的完整素材清单');
  const { manifest, testBridgePresent } = manifests[0];
  return { manifest, testBridgePresent };
}

function filterManifest(manifest, missingPaths) {
  const missing = new Set([...missingPaths].map(value => {
    const pathname = new URL(value, 'http://smoke.invalid/').pathname;
    return decodeURIComponent(pathname).replace(/^\/+/, '');
  }));
  const filtered = structuredClone(manifest);
  filtered.atlases = filtered.atlases.filter(({ key }) =>
    !['png', 'json', 'anims.json'].some(extension => missing.has(`art/sprites/${key}.${extension}`)));
  filtered.areas = filtered.areas.filter(area => !missing.has(`art/tiles/tiles_${area}.png`));
  for (const field of manifestFields.filter(field => field !== 'atlases' && field !== 'areas'))
    filtered[field] = filtered[field].filter(({ path }) => !missing.has(path));
  // sync 从存在的 tiles_<area>.png 登记 metadata 和背景；布局独立登记。
  const removedAreas = manifest.areas.filter(area => !filtered.areas.includes(area));
  filtered.tileMetadata = filtered.tileMetadata.filter(({ path }) =>
    !removedAreas.some(area => path === `art/tiles/tiles_${area}.json`));
  filtered.backgrounds = filtered.backgrounds.filter(({ key }) =>
    !removedAreas.some(area => key.startsWith(`bg_${area}_`)));
  filtered.backgroundConfigs = filtered.backgroundConfigs.filter(({ area }) => !removedAreas.includes(area));
  return filtered;
}

export async function installMissingManifest(context, manifest, missingPaths) {
  const filteredManifest = filterManifest(manifest, missingPaths);
  let rewriteCount = 0;
  // 非枚举计数不进入打包清单；调用方在缺图页面检查它以防拦截没有生效。
  Object.defineProperty(filteredManifest, 'rewriteCount', { get: () => rewriteCount });
  await context.route(url => url.pathname.endsWith('.js'), async route => {
    const response = await route.fetch(), source = await response.text();
    const inspected = inspectModule(source, route.request().url());
    if (!inspected) { await route.fulfill({ response }); return; }
    assert.deepEqual(inspected.manifest, manifest, '共享 preview 素材清单在检查后变化');
    const body = source.slice(0, inspected.start) + JSON.stringify(filteredManifest) + source.slice(inspected.end);
    await route.fulfill({ response, body });
    rewriteCount++;
  });
  return filteredManifest;
}
