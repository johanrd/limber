import { invocationName } from '../utils.ts';

import type { CompileResult } from '../types.ts';
import type { ExtractedCode } from './markdown-to-ember.ts';
import type { UnifiedPlugin } from './types.ts';
import type { EvalImportMap, ScopeMap } from './types.ts';

async function compileAll(js: { code: string }[], importMap?: EvalImportMap) {
  let modules = await Promise.all(
    js.map(async ({ code }) => {
      return await compileGJS(code, importMap);
    })
  );

  return modules;
}

export async function compileGJS(
  gjsInput: string,
  importMap?: EvalImportMap
): Promise<CompileResult> {
  try {
    let { compileJS } = await import('../js.ts');

    return await compileJS(gjsInput, importMap);
  } catch (error) {
    return { error: error as Error, name: 'unknown' };
  }
}

export async function compileHBS(
  hbsInput: string,
  options?: {
    moduleName?: string;
    scope?: Record<string, unknown>;
  }
): Promise<CompileResult> {
  try {
    let { compileHBS } = await import('../hbs.ts');

    return compileHBS(hbsInput, options);
  } catch (error) {
    return { error: error as Error, name: 'unknown' };
  }
}

async function extractScope(
  liveCode: ExtractedCode[],
  importMap?: EvalImportMap
): Promise<CompileResult[]> {
  let scope: CompileResult[] = [];

  let hbs = liveCode.filter((code) => code.lang === 'hbs');
  let js = liveCode.filter((code) => ['js', 'gjs'].includes(code.lang));

  if (js.length > 0) {
    let compiled = await compileAll(js, importMap);

    await Promise.all(
      compiled.map(async (info) => {
        // using web worker + import maps is not available yet (need firefox support)
        // (and to somehow be able to point at npm)
        //
        // if ('importPath' in info) {
        //   return scope.push({
        //     moduleName: name,
        //     component: await import(/* webpackIgnore: true */ info.importPath),
        //   });
        // }

        return scope.push(info);
      })
    );
  }

  for (let { code } of hbs) {
    let compiled = await compileHBS(code);

    scope.push(compiled);
  }

  return scope;
}

export async function compileMD(
  glimdownInput: string,
  options?: {
    importMap?: EvalImportMap;
    topLevelScope?: ScopeMap;
    remarkPlugins?: UnifiedPlugin[];
    CopyComponent?: string;
    ShadowComponent?: string;
  }
): Promise<CompileResult & { rootTemplate?: string }> {
  let importMap = options?.importMap;
  let topLevelScope = options?.topLevelScope ?? {};
  let rootTemplate: string;
  let liveCode: ExtractedCode[];
  let scope: CompileResult[] = [];

  /**
   * Step 1: Convert Markdown To HTML (Ember).
   *
   *         The remark plugin, remark-code-extra also extracts
   *         and transforms the code blocks we care about.
   *
   *         These blocks will be compiled through babel and eval'd so the
   *         compiled rootTemplate can invoke them
   */
  try {
    let { parseMarkdown } = await import('./markdown-to-ember.ts');
    let { templateOnlyGlimdown, blocks } = await parseMarkdown(glimdownInput, {
      CopyComponent: options?.CopyComponent,
      ShadowComponent: options?.ShadowComponent,
      remarkPlugins: options?.remarkPlugins,
    });

    rootTemplate = templateOnlyGlimdown;
    liveCode = blocks;
  } catch (error) {
    return { error: error as Error, name: 'unknown' };
  }

  /**
   * Step 2: Compile the live code samples
   */
  if (liveCode.length > 0) {
    try {
      scope = await extractScope(liveCode, importMap);
    } catch (error) {
      console.info({ scope });
      console.error(error);

      return { error: error as Error, rootTemplate, name: 'unknown' };
    }
  }

  /**
   * Make sure non of our snippets errored
   *
   * TODO: for these errors, report them differently so that we
   * can render the 'Ember' and still highlight the correct line?
   * or maybe there is a way to highlight in the editor instead?
   */
  for (let { error, component } of scope) {
    if (!component) {
      if (error) {
        return { error, rootTemplate, name: 'unknown' };
      }
    }
  }

  /**
   * Step 4: Compile the Ember Template
   */
  try {
    let localScope = scope.reduce(
      (accum, { component, name }) => {
        accum[invocationName(name)] = component;

        return accum;
      },
      {} as Record<string, unknown>
    );

    return await compileHBS(rootTemplate, {
      moduleName: 'DynamicRootTemplate',
      scope: {
        ...topLevelScope,
        ...localScope,
      },
    });
  } catch (error) {
    return { error: error as Error, rootTemplate, name: 'unknown' };
  }
}
