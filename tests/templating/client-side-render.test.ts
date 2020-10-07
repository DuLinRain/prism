import { HTMLElement } from "../../src/chef/html/html";
import { parseTemplate, PrismHTMLElement } from "../../src/templating/template";
import { buildClientRenderMethod } from "../../src/templating/builders/client-render";
import { getSettings } from "../../src/chef/helpers";

const minifiedSettings = getSettings({minify: true});

// TODO all of the testing uses at the serialized output as it quicker to test that equating asts. For better testing that equate ast as to not rely on render testing

describe("Slots", () => {
    test("Switch to delegated yield of yielding a spread expression", () => {
        const template = `<template><slot></slot></template>`;
        const element = HTMLElement.fromString(template);
        parseTemplate(element);
        const componentRenderMethod = buildClientRenderMethod(element, true);
        expect(componentRenderMethod.render(minifiedSettings)).toBe("function* render(){yield* this.slotElement}");
    });
});

describe("h function", () => {
    test("Tag name", () => {
        const template = `<template><h1></h1></template>`;
        const element = HTMLElement.fromString(template);
        parseTemplate(element);
        const componentRenderMethod = buildClientRenderMethod(element, true);
        expect(componentRenderMethod.render(minifiedSettings)).toBe(`function* render(){yield h("h1",0,0)}`);
    });

    test("Attribute", () => {
        const template = `<template><div tabindex="0"></div></template>`;
        const element = HTMLElement.fromString(template);
        parseTemplate(element);
        const componentRenderMethod = buildClientRenderMethod(element, true);
        expect(componentRenderMethod.render(minifiedSettings))
            .toBe(`function* render(){yield h("div",{tabindex:"0"},0)}`);
    });

    test("Dynamic attribute", () => {
        const template = `<template><img $src="someImage"></template>`;
        const element = HTMLElement.fromString(template);
        parseTemplate(element);
        (element.children[0] as PrismHTMLElement).attributes!.delete("class"); // Temp removal of identifer
        const componentRenderMethod = buildClientRenderMethod(element, true);
        expect(componentRenderMethod.render(minifiedSettings))
            .toBe(`function* render(){yield h("img",{src:this.data.someImage},0)}`);
    });

    test("Events", () => {
        const template = `<template><button @click="someEvent"></button></template>`;
        const element = HTMLElement.fromString(template);
        parseTemplate(element);
        (element.children[0] as PrismHTMLElement).attributes!.delete("class"); // Temp removal of identifer
        const componentRenderMethod = buildClientRenderMethod(element, true);
        expect(componentRenderMethod.render(minifiedSettings))
            .toBe(`function* render(){yield h("button",0,{click:this.someEvent.bind(this)})}`);
    });

    test("Text", () => {
        const template = `<template><h1>Hello World</h1></template>`;
        const element = HTMLElement.fromString(template);
        parseTemplate(element);
        const componentRenderMethod = buildClientRenderMethod(element, true);
        expect(componentRenderMethod.render(minifiedSettings))
            .toBe(`function* render(){yield h("h1",0,0,"Hello World")}`);
    });
});