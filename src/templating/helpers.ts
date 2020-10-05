import { PrismHTMLElement, IEvent, IDependency, Locals, PartialDependency, VariableReferenceArray, ForLoopVariable } from "./template";
import { IValue, Value, Type } from "../chef/javascript/components/value/value";
import { HTMLElement, HTMLDocument } from "../chef/html/html";
import { VariableReference } from "../chef/javascript/components/value/variable";
import { Expression, Operation } from "../chef/javascript/components/value/expression";
import { ArgumentList } from "../chef/javascript/components/constructs/function";
import { cloneAST, findVariables } from "../chef/javascript/utils/variables";
import { findLastIndex } from "../helpers";
import { IType } from "../chef/javascript/utils/types";
import { ForIteratorExpression } from "../chef/javascript/components/statements/for";

export const thisDataVariable = VariableReference.fromChain("this", "data");

const usedIds = new Set();

export function randomPrismId(): string {
    let id = randomId();
    while (usedIds.has(id)) {
        id = randomId();
    }
    usedIds.add(id);
    return "p" + id;
}

function randomId() {
    return getRandomInt(0, 1e5).toString(36);
}

function getRandomInt(min: number = 0, max: number = 9) {
    return Math.floor(Math.random() * Math.floor(max - min)) + min;
}

/**
 * Adds a new identifier to an element. Used to reference elements at runtime. Adds identifer as a class (not id)
 */
export function addIdentifierToElement(element: PrismHTMLElement): string {
    if (element.identifier) {
        return element.identifier;
    } else {
        const identifier = randomPrismId();
        element.identifier = identifier;
        if (!element.attributes) {
            element.attributes = new Map([["class", identifier]]);
        } else if (element.attributes.has("class")) {
            element.attributes.set("class", element.attributes.get("class") + " " + identifier);
        } else {
            element.attributes.set("class", identifier);
        }
        return identifier;
    }
}

export function addEvent(events: Array<IEvent>, element: PrismHTMLElement, event: IEvent) {
    events.push(event);
    if (element.events) {
        element.events.push(event);
    } else {
        element.events = [event];
    }
}

export function addAttribute(element: PrismHTMLElement, name: string, attribute: string | IValue | null = null) {
    if (attribute === null) {
        if (!element.attributes) {
            element.attributes = new Map();
        }
        element.attributes.set(name, null);
    } else if (typeof attribute === "string") {
        if (!element.attributes) {
            element.attributes = new Map();
        }
        element.attributes.set(name, attribute);
    } else {
        if (!element.dynamicAttributes) {
            element.dynamicAttributes = new Map();
        }
        element.dynamicAttributes.set(name, attribute);
    }
}

export function createNullElseElement(identifier: string): HTMLElement {
    return new HTMLElement("span", new Map([
        ["class", identifier],
        ["data-else", null]
    ]));
}

/**
 * Fills a dependency. Does a bunch of side effects:
 * - Adding to the array of dependencies
 * - Aliasing the expression to be in terms of this.data
 * @param partialDependency 
 * @param locals Variables introduced by for of statements
 * @param globals Variables outside of class
 */
export function addDependency(partialDependency: PartialDependency, locals: Locals, globals: Array<VariableReference>, dependencies: Array<IDependency>) {
    const uniqueExpression = cloneAST(partialDependency.expression);
    const variablesInExpression = findVariables(uniqueExpression, true);

    let referencesVariables: Array<VariableReferenceArray> = [];

    // Parse all referenced variables 
    for (const variable of variablesInExpression) {
        // Skip globals
        if (globals.some(global => global.isEqual(variable, true))) continue;

        let inLocals = false;
        for (const { name, path } of locals) {
            if ((variable.tail as VariableReference).name === name) {
                inLocals = true;
                // Adjoins the path to the array with the path of the variable (slice(1) cuts out the iteration variable)
                referencesVariables.push(path.concat(variable.toChain().slice(1)));
            }
        }

        if (!inLocals) {
            const thisVariableArr = variable.toChain();
            if (!referencesVariables.some(rv => variableReferenceArrayEqual(rv, thisVariableArr))) {
                referencesVariables.push(thisVariableArr);
            }

            // If its a local alias it to this.data
            (variable.tail as VariableReference).parent = thisDataVariable;
        }
    }

    if (referencesVariables.length > 0) {
        const dependency: IDependency = {
            ...partialDependency,
            expression: uniqueExpression,
            referencesVariables
        }

        dependencies.push(dependency);
    }
}

/**
 * Returns whether variable reference arrays are equal
 */
function variableReferenceArrayEqual(vra1: VariableReferenceArray, vra2: VariableReferenceArray) {
    return (
        vra1.length === vra2.length
        && vra1.every(
            (part, index) => typeof part === "string" ? part === vra2[index] : typeof part === typeof vra2[index])
    )
}

/** 
 * Returns a getElem(*id*) expression 
 * For getting a single node under a for statement use `getSpecificElem`
*/
export function getElem(element: PrismHTMLElement): Expression {
    // TODO maybe automatically set elements identifier
    if (!element.identifier) throw Error("Cannot create getElem expression from node without set identifer");
    return new Expression({
        lhs: VariableReference.fromChain("this", "getElem"),
        operation: Operation.Call,
        rhs: new ArgumentList([new Value(element.identifier, Type.string)])
    });
}

/**
 * Returns a chained .children[x] statement from which the instance parent value statement returns the instance of descendant
 * TODO account for nullable elements
 * @param ancestor a ancestor of the descendant
 * @param element a descendant of the descendant
 */
export function getChildrenStatement(element: HTMLElement): IValue {
    if ((element as PrismHTMLElement)?.multiple === false) {
        return getElem(element)
    }

    // Work backwards up the parent chain until get to parent:
    const indexes: Array<number | "var"> = [];
    let point = element;
    while (((point as PrismHTMLElement).multiple === true)) {
        if ((point.parent as PrismHTMLElement)?.clientExpression instanceof ForIteratorExpression) {
            indexes.push("var");
        } else {
            indexes.push(point.parent!.children.indexOf(point))
        }
        point = point.parent! as HTMLElement;
    }
    if (point instanceof HTMLDocument) {
        throw Error("getElementStatement - child is not descendant of parent");
    }

    // Point is now end
    let statement: IValue = getElem(point);
    let indexer = 0;

    // Reverse as worked upwards but statement works downwards
    for (let i = indexes.length - 1; i >= 0; i--) {
        const index = indexes[i];
        if (index === "var") {
            statement = new Expression({
                lhs: new VariableReference("children", statement),
                operation: Operation.Index,
                rhs: new VariableReference(String.fromCharCode(indexer++ + 120))
            });
        } else {
            statement = new Expression({
                lhs: new VariableReference("children", statement),
                operation: Operation.Index,
                rhs: new Value(indexes[i], Type.number)
            });
        }
    }

    return statement;
}

/**
 * Finds the corresponding type signature from a variableReferenceArray
 */
export function getTypeFromVariableReferenceArray(
    reference: VariableReferenceArray,
    dataType: IType
): IType {
    let type: IType = dataType;
    for (const part of reference) {
        if (typeof part === "object" || typeof part === "number") {
            if (!type.indexed) {
                throw Error(`Indexable property does not exist on "${typeof part === "object" ? part.alias : part}"`);
            }
            type = type.indexed;
        } else {
            if (!type.properties) {
                throw Error(`"${type.name}" does not have any properties`);
            }
            if (!type.properties.has(part)) {
                throw Error(`Property "${part}" does not exist on type: "${type.name}"`);
            }
            type = type.properties.get(part)!;
        }
    }
    return type;
}

/**
 * Will return the last arm of the variable reference array
 * @param arr A variable reference array
 * @example `["a", {alias: "b"}, "c"]` -> `["b", "c"]`
 */
export function getSlice(arr: VariableReferenceArray): Array<string> {
    const index = findLastIndex(arr, p => typeof p === "object");
    if (index < 0) return arr as Array<string>;
    return [(arr[index] as ForLoopVariable).alias, ...arr.slice(index + 1)] as Array<string>;
}