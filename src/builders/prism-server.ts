import { serverRenderPrismNode } from "../templating/builders/server-render";
import { posix, join } from "path";
import { HTMLDocument, flatElements, HTMLElement } from "../chef/html/html";
import type { PrismNode } from "../templating/template";
import { FunctionDeclaration } from "../chef/javascript/components/constructs/function";
import { ReturnStatement } from "../chef/javascript/components/statements/statement";
import { Module } from "../chef/javascript/components/module";
import { VariableDeclaration } from "../chef/javascript/components/statements/variable";
import { TypeSignature } from "../chef/javascript/components/types/type-signature";
import { getRoutes } from "./client-side-routing";
import { settings } from "../settings";

/**
 * Builds a server module including a function which wraps a component in a document. 
 * Also includes the escape HTML function
 * TODO there is some overlap with client-bundle
 * @param path The path to the final server module (TODO)
 */
export function generateServerModule(path: string): Module {
    const baseServerModule = new Module();
    baseServerModule.filename = path;

    const htmlPage = HTMLDocument.fromFile(settings.absoluteTemplatePath);

    for (const element of flatElements(htmlPage) as Array<PrismNode>) {
        if (element instanceof HTMLElement && element.tagName === "slot") {

            element.slotFor = element.attributes?.get("for") ?? "content";

            // Injecting router
            if (element.slotFor === "content" && getRoutes().length > 1) {
                const slotParent = element.parent!;
                const router = new HTMLElement("router-component", null, [element], element.parent);
                slotParent.children.splice(slotParent.children.indexOf(element), 1, router);
            }
        } else if (element instanceof HTMLElement && element.tagName === "head") {
            // TODO a little temp of hardcoded import of the static bundles
            // TODO link bundle names
            const styleBundleTag = new HTMLElement(
                "link",
                new Map([
                    ["href", posix.join(settings.staticSrc, "bundle.css")],
                    ["rel", "stylesheet"]
                ]),
                [],
                element
            );

            const scriptBundleTag = new HTMLElement(
                "script",
                new Map([
                    ["src", posix.join(settings.staticSrc, "bundle.js")],
                    ["defer", null]
                ]),
                [],
                element
            );

            element.children.push(scriptBundleTag);
            element.children.push(styleBundleTag);
        }
    }

    // Create a template literal to build the index page. As the template has been parsed it will include slots for rendering slots
    const pageRenderTemplateLiteral = serverRenderPrismNode(htmlPage, [], settings.minify);

    // Create function with content and meta slot parameters
    const pageRenderFunction = new FunctionDeclaration(
        "renderHTML",
        [
            new VariableDeclaration("contentSlot", { typeSignature: new TypeSignature({ name: "string" }) }),
            new VariableDeclaration("metaSlot", { typeSignature: new TypeSignature({ name: "string" }) })
        ],
        [new ReturnStatement(pageRenderTemplateLiteral)],
    );

    baseServerModule.addExport(pageRenderFunction);

    // Include the escape function
    const bundledServerModule = Module.fromFile(join(__dirname, "../bundle/server.ts"));

    const escapedFunction = bundledServerModule.statements.find(statement =>
        statement instanceof FunctionDeclaration && statement.name?.name === "escape") as FunctionDeclaration;

    baseServerModule.addExport(escapedFunction);

    return baseServerModule;
}