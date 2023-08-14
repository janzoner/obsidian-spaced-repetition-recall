export class DateUtils {
    static addTime(date: Date, time: number): Date {
        return new Date(date.getTime() + time);
    }

    static fromNow(time: number): Date {
        return this.addTime(new Date(), time);
    }

    static DAYS_TO_MILLIS = 86400000;
}

const characters = "abcdefghijklmnopqrstuvwxyz0123456789";
export class BlockUtils {
    static generateBlockId(length?: number): string {
        if (length === undefined) length = 6;
        let hash = "";
        for (let i = 0; i < length; i++) {
            hash += characters.charAt(Math.floor(Math.random() * characters.length));
        }

        return hash;
    }
}

export class MiscUtils {
    /**
     * Creates a copy of obj, and copies values from source into
     * the copy, but only if there already is a property with the
     * matching name.
     *
     * @param obj
     * @param source
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static assignOnly(obj: any, source: any): any {
        const newObj = Object.assign(obj);
        if (source != undefined) {
            Object.keys(obj).forEach((key) => {
                if (key in source) {
                    newObj[key] = source[key];
                }
            });
        }
        return newObj;
    }

    /**
     * Creates a copy of obj, and copies values from source into
     * the copy
     *
     * @param obj
     * @param source
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static assignObjFully(obj: any, source: any): any {
        const newObj = Object.assign(obj, JSON.parse(JSON.stringify(source)));
        return newObj;
    }

    /**
     * getRegExpGroups. Counts the number of capturing groups in the provided regular
     * expression.
     *
     * @param {RegExp} exp
     * @returns {number}
     */
    static getRegExpGroups(exp: RegExp): number {
        // Count capturing groups in RegExp, source: https://stackoverflow.com/questions/16046620/regex-to-count-the-number-of-capturing-groups-in-a-regex
        return new RegExp(exp.source + "|").exec("").length - 1;
    }

    /**
     * shuffle. Shuffles the given array in place into a random order
     * using Durstenfeld shuffle.
     *
     * @param {any[]} array
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static shuffle(array: any[]) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }
}

// https://github.com/chartjs/Chart.js/blob/master/src/helpers/helpers.core.ts
/**
 * Returns true if `value` is an array (including typed arrays), else returns false.
 * @param value - The value to test.
 * @function
 */
export function isArray<T = unknown>(value: unknown): value is T[] {
    if (Array.isArray && Array.isArray(value)) {
        return true;
    }
    const type = Object.prototype.toString.call(value);
    if (type.slice(0, 7) === "[object" && type.slice(-6) === "Array]") {
        return true;
    }
    return false;
}

// https://github.com/zsviczian/obsidian-excalidraw-plugin/
export const isVersionNewerThanOther = (version: string, otherVersion: string): boolean => {
    const v = version.match(/(\d+)\.(\d+)\.(\d+?)\.?(\d+)?/);
    const o = otherVersion.match(/(\d+)\.(\d+)\.(\d+?)\.?(\d+)?/);

    return Boolean(
        v &&
            v.length >= 4 &&
            o &&
            o.length >= 4 &&
            !(isNaN(parseInt(v[1])) || isNaN(parseInt(v[2])) || isNaN(parseInt(v[3]))) &&
            !(isNaN(parseInt(o[1])) || isNaN(parseInt(o[2])) || isNaN(parseInt(o[3]))) &&
            (parseInt(v[1]) > parseInt(o[1]) ||
                (parseInt(v[1]) >= parseInt(o[1]) && parseInt(v[2]) > parseInt(o[2])) ||
                (parseInt(v[1]) >= parseInt(o[1]) &&
                    parseInt(v[2]) >= parseInt(o[2]) &&
                    parseInt(v[3]) > parseInt(o[3])) ||
                (v.length > 4 && o.length === 4) ||
                (v.length > 4 && o.length > 4 && parseInt(v[4]) > parseInt(o[4]))),
    );
};

// eslint-disable-next-line @typescript-eslint/ban-types
export const errorlog = (data: {}) => {
    console.error({ plugin: "Spaced-rep-recall:", ...data });
};
