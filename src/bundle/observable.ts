import type { Component } from "./component";
import { isArrayHoley } from "./helpers";

// TODO:
// interface IMapping {
//     type?: string,
// }

/**
 * (Create Observable)
 * Will create either a observable array, observable object or a existing object based on the `type` of `chunk`
 * @param c Chunk to create observable over
 * @param d Any existing data
 * @param i Any indexes data is under
 */
export function cO(this: Component<any>, c: any, d: any, ...i: Array<number>) {
    if (c.get) return c.get.call(this, ...i);
    else if (c.type === "Array") return cOA.call(this, c, d, [], ...i);
    else return cOO.call(this, c, d, {}, ...i);
}

/**
 * (Create Observable Object)
 * Creates a proxy for data which fronts a mapping tree.
 *  - Calls get bindings if data is not cached
 *  - On set bindings calls set operations
 *  - On nested data recursively makes observables
 * @param m A set of mappings (generated by Prism)
 * @param d Any original data
 * @param pC Proxy cache. Holds proxies so they are not regenerated
 * @param i If the observable is under a array then a index
 */
export function cOO<T>(
    this: Component<T>,
    m: any,
    d: Partial<T>,
    pC: any = {},
    ...i: Array<number>
): T {
    return new Proxy(d, {
        // target, prop, receiver
        get: (t, p, r) => {
            // Work around for JSON.stringify thing
            if (p === "toJSON") {
                const o = Object;
                return JSON.stringify(
                    o.assign(t,
                        o.fromEntries(o.keys(r).map(k => [k, r[k]]))))
            }
            // Get the respective (c)hunk on the mapping tree
            const c = m[p];
            if (!c) return;
            // If chunk has type then the property is an object
            if (c?.type) {
                return pC[p] ??
                    (pC[p] =
                        cO.call(
                            this,
                            c,
                            t[p] ?? (t[p] = c.type === "Array" ? [] : {}),
                            ...i)
                    )
            }
            // Try get property from cache (target) else get the prop and set its value to the cache
            return t[p] ?? (t[p] = c.get?.call?.(this, ...i)); 
        },
        // target, prop, value, receiver
        set: (t, p, v, r) => {
            // Get the respective (c)hunk on the mapping tree
            const c = m[p];
            // If has type assign the new object which ...
            if (c?.type) {
                Object.assign(pC[p] ?? r[p], v);
                if (Array.isArray(v)) {
                    pC[p].length = v.length;
                }
            } else {
                Reflect.set(t, p, v);
            }
            // Try call set handlers
            c?.set?.call?.(this, v, ...i)
            return true;
        },
        has(_, p) {
            return p in m;
        },
        ownKeys() {
            return Object.keys(m)
        },
        getOwnPropertyDescriptor() {
            return {configurable: true, enumerable: true, writable: true}
        }
    }) as T;
}

/**
 * (Create Observable Array)
 * TODO does not like reverse, shift and some other methods
 */
export function cOA<T>(
    this: Component<any>,
    m: any,
    a: Array<T>,
    pC: Array<any> = [], // Not always needed
    ...i: Array<number>
): Array<T> {
    return new Proxy(a, {
        get: (t, p, r) => {
            if (p === "toJSON") return JSON.stringify(Object.assign(t ?? [], Array.from(r)));
            if (p === "length") {
                // Check that array is not wholely
                return (!isArrayHoley(t) && t.length) || (t.length = m.length.get?.call?.(this, ...i) ?? 0);
            }
            if (m["*"]?.type && typeof p !== "symbol" && !isNaN((p as number))) {
                return pC[p]
                    ?? (pC[p] = cO.call(
                        this,
                        m["*"],
                        a[p] ?? (a[p] = m["*"].type === "Array" ? [] : {}),
                        ...i,
                        p
                    ));
            }
            return t[p] ?? (t[p] = m["*"].get.call(this, ...i, p));
        },
        set: (t, p, v, r) => {
            Reflect.set(t, p, v);
            // prevLength
            let pl = t.length;
            if (p === "length") {
                if (v < pl) {
                    m.length.set.call(this, ...i, v);
                    m?.set?.call?.(this, t, ...i);
                    if (m.type["*"]) pC.length = v;
                }
            } else {
                m?.set?.call?.(this, t, ...i);
                if ((p as number) >= pl) {
                    m.push.call(this, v, ...i);
                } else {
                    if (m["*"].type) {
                        // Assign to the cache on a per property basis. If proxyCache does not exist create it from the receiver
                        Object.assign(pC[p] ?? r[p], v);
                        if (Array.isArray(v)) pC[p].length = v.length;
                    } else {
                        m["*"].set?.call?.(this, v, ...i, p);
                    }
                }
            }
            return true;
        }
    });
}