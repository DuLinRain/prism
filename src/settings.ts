import { join, isAbsolute } from "path";

export interface IPrismSettings {
    minify: boolean, // Removes whitespace for space saving in output
    backendLanguage: "js" | "ts" | "rust", // The languages to output server templates in
    comments: boolean, // Leave comments in TODO comment levels
    projectPath: string, // The path to the components folder OR a single component
    assetPath: string | null, // The path to the assets folder
    outputPath: string, // The path to the output folder
    serverOutputPath: string | null, // The path to the output folder
    templatePath: string, // The path to the output folder
    context: "client" | "isomorphic", // If client will not build server paths or add hydration logic to client bundle
    staticSrc: string, // Prefix,
    clientSideRouting: boolean,
    disableEventElements: boolean,
    buildTimings: boolean, // Whether to print timings of the static build
    run: boolean | "open", // Whether to run output after build
    deno: boolean
}

export const defaultTemplateHTML = "bundle/template.html";

const defaultSettings: IPrismSettings = {
    minify: false,
    comments: false,
    projectPath: "./src",
    outputPath: "./out",
    // These two are both null because they relate to project path and output path. There "defaults" are encoded in the respective actual getters in exported setters:
    assetPath: null,
    serverOutputPath: null,
    templatePath: defaultTemplateHTML,
    staticSrc: "/",
    backendLanguage: "js",
    context: "isomorphic",
    clientSideRouting: true,
    disableEventElements: true,
    run: false,
    buildTimings: false,
    deno: false
};

/**
 * Adds some getters because projectPath and outputPath can be relative
 * Relative to cwd
 * @example if projectPath = "../abc" then absoluteProjectPath ~ "C:/abc"
 */
export interface IFinalPrismSettings extends IPrismSettings {
    cwd: string,
    pathSplitter: string,
    absoluteProjectPath: string,
    absoluteOutputPath: string,
    absoluteAssetPath: string,
    absoluteServerOutputPath: string,
    absoluteTemplatePath: string,
}

export function makePrismSettings(cwd: string, pathSplitter: string, partialSettings: Partial<IPrismSettings>, ): IFinalPrismSettings {
    const projectPath = partialSettings.projectPath ?? defaultSettings.projectPath;
    const outputPath = partialSettings.outputPath ?? defaultSettings.outputPath;
    const assetPath = partialSettings.assetPath ?? join(projectPath, "assets");
    const serverOutputPath = partialSettings.serverOutputPath ?? join(outputPath, "server");
    const templatePath = partialSettings.templatePath ?? defaultSettings.templatePath;
    return {
        ...defaultSettings,
        ...partialSettings,
        cwd, pathSplitter,
        absoluteProjectPath: isAbsolute(projectPath) ? projectPath : join(cwd, projectPath),
        absoluteOutputPath: isAbsolute(outputPath) ? outputPath : join(cwd, outputPath),
        absoluteAssetPath: isAbsolute(assetPath) ? assetPath : join(cwd, assetPath),
        absoluteServerOutputPath: isAbsolute(serverOutputPath) ? serverOutputPath : join(cwd, serverOutputPath),
        absoluteTemplatePath: isAbsolute(templatePath) ? templatePath : join(cwd, templatePath),
    };
}