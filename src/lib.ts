import { Block, Statement } from 'schedule-script';

export function recurseInto(b: Block | Statement, cb: (s: Statement, parent?: Statement) => void, parent?: Statement) {
    if (Array.isArray(b)) {
        b.forEach((e) => recurseInto(e, cb, parent));
    } else {
        cb(b, parent);
        b.args.forEach((c) => {
            if (c.type == 'block') {
                recurseInto(c.data, cb, b);
            }
        });
    }
}
