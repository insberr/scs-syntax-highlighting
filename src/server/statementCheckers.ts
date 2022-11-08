import { Statement } from "schedule-script";

export type Checker = (
    statement: Statement,
    parent?: Statement
) => string | void;

function combine(checks: Checker[]): Checker {
    return (statement: Statement, parent?: Statement) => {
        for (const check of checks) {
            const err = check(statement, parent);
            if (err) {
                return err;
            }
        }
    };
}

function parenting(parents: { [key: string]: Checker }): Checker {
    return (statement: Statement, parent?: Statement) => {
        let parentStatement: string;
        if (!parent) {
            parentStatement = "root";
        } else {
            parentStatement = parent.statement;
        }
        if (!Object.keys(parents).includes(parentStatement)) {
            return `Statement ${
                statement.statement
            } must be inside ${Object.keys(parents).join(
                ", "
            )}, not ${parentStatement}`;
        } else {
            return parents[parentStatement](statement, parent);
        }
    };
}

function formatType(t: string): string {
    return (
        {
            text: "text",
            block: "block",
            quote: "quoted string",
            bracket: "bracketed string",
        }[t] || t
    );
}

function argumentOfType(
    argumentIndex: number,
    type: "quote" | "text" | "block" | "bracket"
): Checker {
    return (statement: Statement, parent?: Statement) => {
        if (statement.args[argumentIndex].type != type) {
            return `Argument ${argumentIndex} of ${
                statement.statement
            } must be a ${formatType(type)}, not a ${formatType(
                statement.args[argumentIndex].type
            )}`;
        }
    };
}
function hasAmtOfArgs(amt: number) {
    return (statement: Statement, parent?: Statement) => {
        if (statement.args.length != amt) {
            return `Statement ${statement.statement} must have ${amt} arguments, not ${statement.args.length}`;
        }
    };
}

export const checkers = new Map<string, Checker>()
    .set(
        "schedule",
        parenting({
            root: combine([
                hasAmtOfArgs(2),
                argumentOfType(0, "text"),
                argumentOfType(1, "block"),
            ]),
            event: combine([hasAmtOfArgs(1), argumentOfType(0, "text")]),
        })
    )
    .set(
        "term",
        parenting({
            terms: combine([
                hasAmtOfArgs(3),
                argumentOfType(0, "text"),
                argumentOfType(1, "bracket"),
                argumentOfType(2, "bracket"),
            ]),
        })
    )
    .set(
        "info",
        parenting({
            event: combine([hasAmtOfArgs(1), argumentOfType(0, "quote")]),
        })
    )
    .set(
        "description",
        parenting({
            schedule: combine([hasAmtOfArgs(1), argumentOfType(0, "quote")]),
        })
    )
    .set("root", () => "reserved statement: root");
