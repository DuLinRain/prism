import { ClassDeclaration } from "../components/constructs/class";
import { IStatement, ReturnStatement } from "../components/statements/statement";
import { Expression, Operation } from "../components/value/expression";
import { IfStatement, ElseStatement } from "../components/statements/if";
import { IValue, Value } from "../components/value/value";
import { ArgumentList, FunctionDeclaration } from "../components/constructs/function";
import { IConstruct } from "../../helpers";
import { TemplateLiteral } from "../components/value/template-literal";
import { ObjectLiteral } from "../components/value/object";
import { VariableReference } from "../components/value/variable";
import { ForIteratorExpression, ForStatementExpression, ForStatement } from "../components/statements/for";
import { VariableDeclaration } from "../components/statements/variable";
import { ArrayLiteral } from "../components/value/array";

/**
 * Returns variables spanning from "this.*"
 * @param cls 
 */
export function getVariablesInClass(cls: ClassDeclaration): Array<VariableReference> {
    const variables: Array<VariableReference> = [];
    for (const member of cls.members) {
        for (const variable of findVariables(member)) {
            if (variable.toChain()[0] === "this") {
                variables.push(variable);
            }
        }
    }
    return variables;
}

/**
 * Walks through a statement and yields ALL variable references
 * Lot of "as" here as TypeScript does not like switching on the constructor
 * @param cloneStructure Will clone structure while walking. TODO maybe implement this separately
 */
export function* variableReferenceWalker(statement: IStatement): Generator<VariableReference> {
    if (statement instanceof VariableReference) {
        yield statement;
    } else if (statement instanceof Expression) {
        // TODO temp catch for optional chain
        if (statement.operation === Operation.OptionalChain) {
            yield variableReferenceFromOptionalChain(statement);
        } else {
            yield* variableReferenceWalker(statement.lhs);
            if (statement.rhs) yield* variableReferenceWalker(statement.rhs);
        }
    } else if (statement instanceof ReturnStatement) {
        if (statement.returnValue) yield* variableReferenceWalker(statement.returnValue);
    } else if (statement instanceof FunctionDeclaration) {
        for (const statementInFunc of statement.statements) {
            yield* variableReferenceWalker(statementInFunc);
        }
    } else if (statement instanceof ArgumentList) {
        for (const value of statement.args) {
            yield* variableReferenceWalker(value);
        }
    } else if (statement instanceof TemplateLiteral) {
        for (const value of statement.entries) {
            if (typeof value !== "string") yield* variableReferenceWalker(value);
        }
    } else if (statement instanceof ObjectLiteral) {
        for (const [, value] of statement.values) {
            yield* variableReferenceWalker(value)
        }
    } else if (statement instanceof ForIteratorExpression) {
        yield* variableReferenceWalker(statement.subject);
    } else if (statement instanceof ForStatement) {
        yield* variableReferenceWalker(statement.expression);
        for (const s of statement.statements) {
            yield* variableReferenceWalker(s);
        }
    } else if (statement instanceof IfStatement) {
        yield* variableReferenceWalker(statement.condition);
        for (const s of statement.statements) {
            yield* variableReferenceWalker(s);
        }
    }
}

/**
 * Mimic constructor signature of VariableReference but uses optional chain
 */
export function newOptionalVariableReference(name: string, parent: IValue) {
    return new Expression({
        lhs: parent,
        operation: Operation.OptionalChain,
        rhs: new VariableReference(name)
    });
}

/**
 * Returns a definite variable reference from a optional variable reference
 * @param expr 
 * @example `a?.b?.c` -> `a.b.c`
 */
export function variableReferenceFromOptionalChain(expr: Expression): VariableReference {
    if (expr.operation !== Operation.OptionalChain) {
        throw Error(`Expected optional chain received ${Operation[expr.operation]}`);
    }
    return new VariableReference(
        (expr.rhs as VariableReference).name, 
        expr.lhs instanceof Expression && expr.lhs.operation === Operation.OptionalChain ? variableReferenceFromOptionalChain(expr.lhs) : expr.lhs
    );
}

/** 
 * Returns variables in a statement
 * @param allVariables whether to return 
*/
export function findVariables(statement: IStatement, allVariables: boolean = false): Array<VariableReference> {
    const variables: Array<VariableReference> = [];
    for (const variable of variableReferenceWalker(statement)) {
        // Check variable has not already been registered
        if (allVariables || !variables.some(regVariable => regVariable.isEqual(variable))) {
            variables.push(variable);
        }
    }
    return variables;
}

/**
 * Alias variables in place
 * TODO:
 *  Duplicate ...
 *  Also some sort of guard e.g I don't want functions to be aliased
 *  Pick up on new variables being introduced
 * @example (myProp, this) -> this.myProp
 * @param locals A set of variables to not alias
 */
export function aliasVariables(
    value: IConstruct,
    parent: VariableReference,
    locals: Array<VariableReference> = []
): void {
    for (const variable of variableReferenceWalker(value)) {
        if (!locals.some(local => local.isEqual(variable, true))) {
            let parentVariable: VariableReference = variable;
            while (parentVariable.parent) {
                parentVariable = parentVariable.parent as VariableReference;
            }

            parentVariable.parent = parent;
        }
    }
}

/**
 * TODO object assign bad
 * TODO fuzzy?
 */
export function replaceVariables(
    value: IConstruct,
    replacer: IValue | ((intercepted: VariableReference) => IValue),
    targets: Array<VariableReference>
): void {
    for (const variable of variableReferenceWalker(value)) {
        if (targets.some(targetVariable => targetVariable.isEqual(variable))) {
            let replacerValue: IValue;
            if (typeof replacer === "function") {
                replacerValue = replacer(variable);
            } else {
                replacerValue = replacer;
            }
            // TODO this is kinda funky:
            // Clear keys, reassign to object, set prototype
            Object.keys(variable).forEach(key => delete variable[key]);
            Object.assign(variable, replacerValue);
            Object.setPrototypeOf(variable, Object.getPrototypeOf(replacerValue));
        }
    }
}

/**
 * TODO temp
 * Could do by rendering out ast and re parsing lol
 */
export function cloneAST(part: IConstruct) {
    if (part === null) return null;

    if (part instanceof VariableReference) {
        return new VariableReference(part.name, part.parent ? cloneAST(part.parent) : undefined);
    } else if (part instanceof Value) {
        return new Value(part.value, part.type);
    } else if (part instanceof Expression) {
        return new Expression({
            lhs: cloneAST(part.lhs),
            operation: part.operation,
            rhs: part.rhs ? cloneAST(part.rhs) : undefined
        });
    } else if (part instanceof IfStatement) {
        return new IfStatement(
            cloneAST(part.condition),
            part.statements,
            part.consequent ? cloneAST(part.consequent) : undefined
        );
    } else if (part instanceof ElseStatement) {
        return new ElseStatement(
            part.condition ? cloneAST(part.condition) : undefined,
            part.statements,
            part.consequent ? cloneAST(part.consequent) : undefined);
    } else if (part instanceof TemplateLiteral) {
        return new TemplateLiteral(
            part.entries.map(entry => typeof entry === "string" ? entry : cloneAST(entry)),
            part.tag
        );
    } else if (part instanceof ArgumentList) {
        return new ArgumentList(part.args.map(arg => cloneAST(arg)));
    } else if (part instanceof ForIteratorExpression) {
        return new ForIteratorExpression(cloneAST(part.variable), part.operation, cloneAST(part.subject));
    } else if (part instanceof VariableDeclaration) {
        return new VariableDeclaration(part.entries ?? part.name, { ...part });
    } else if (part instanceof ForIteratorExpression) {
        return new ForIteratorExpression(cloneAST(part.variable), part.operation, cloneAST(part.subject));
    }else if (part instanceof ArrayLiteral) {
        return new ArrayLiteral(part.elements.map(cloneAST));
    } else if (part instanceof ForStatementExpression) {
        return new ForStatementExpression(cloneAST(part.initializer), cloneAST(part.condition), cloneAST(part.finalExpression));
    } else {
        throw Error(`Could not clone part of instance "${part.constructor.name}"`)
    }
}