import { Card } from "./Card";
import { CardType } from "./Question";
import { SRSettings } from "./settings";
import { findLineIndexOfSearchStringIgnoringWs } from "./util/utils";

export class CardFrontBack {
    front: string;
    back: string;

    // The caller is responsible for any required trimming of leading/trailing spaces
    constructor(front: string, back: string) {
        this.front = front;
        this.back = back;
    }
}

export class CardFrontBackUtil {
    static expand(
        questionType: CardType,
        questionText: string,
        settings: SRSettings,
    ): CardFrontBack[] {
        const handler: IQuestionTypeHandler = QuestionTypeFactory.create(questionType);
        return handler.expand(questionText, settings);
    }
}

export interface IQuestionTypeHandler {
    expand(questionText: string, settings: SRSettings): CardFrontBack[];
}

class QuestionType_SingleLineBasic implements IQuestionTypeHandler {
    expand(questionText: string, settings: SRSettings): CardFrontBack[] {
        const idx: number = questionText.indexOf(settings.singleLineCardSeparator);
        const item: CardFrontBack = new CardFrontBack(
            questionText.substring(0, idx),
            questionText.substring(idx + settings.singleLineCardSeparator.length),
        );
        const result: CardFrontBack[] = [item];
        return result;
    }
}

class QuestionType_SingleLineReversed implements IQuestionTypeHandler {
    expand(questionText: string, settings: SRSettings): CardFrontBack[] {
        const idx: number = questionText.indexOf(settings.singleLineReversedCardSeparator);
        const side1: string = questionText.substring(0, idx),
            side2: string = questionText.substring(
                idx + settings.singleLineReversedCardSeparator.length,
            );
        const result: CardFrontBack[] = [
            new CardFrontBack(side1, side2),
            new CardFrontBack(side2, side1),
        ];
        return result;
    }
}

class QuestionType_MultiLineBasic implements IQuestionTypeHandler {
    expand(questionText: string, settings: SRSettings): CardFrontBack[] {
        // We don't need to worry about "\r\n", as multi line questions processed by parse() concatenates lines explicitly with "\n"
        const questionLines = questionText.split("\n");
        const lineIdx = findLineIndexOfSearchStringIgnoringWs(
            questionLines,
            settings.multilineCardSeparator,
        );
        const side1: string = questionLines.slice(0, lineIdx).join("\n");
        const side2: string = questionLines.slice(lineIdx + 1).join("\n");

        const result: CardFrontBack[] = [new CardFrontBack(side1, side2)];
        return result;
    }
}

class QuestionType_MultiLineReversed implements IQuestionTypeHandler {
    expand(questionText: string, settings: SRSettings): CardFrontBack[] {
        // We don't need to worry about "\r\n", as multi line questions processed by parse() concatenates lines explicitly with "\n"
        const questionLines = questionText.split("\n");
        const lineIdx = findLineIndexOfSearchStringIgnoringWs(
            questionLines,
            settings.multilineReversedCardSeparator,
        );
        const side1: string = questionLines.slice(0, lineIdx).join("\n");
        const side2: string = questionLines.slice(lineIdx + 1).join("\n");

        const result: CardFrontBack[] = [
            new CardFrontBack(side1, side2),
            new CardFrontBack(side2, side1),
        ];
        return result;
    }
}

class QuestionType_Cloze implements IQuestionTypeHandler {
    expand(questionText: string, settings: SRSettings): CardFrontBack[] {
        const siblings: RegExpMatchArray[] = QuestionType_ClozeUtil.getSiblings(
            questionText,
            settings,
        );

        let front: string, back: string;
        const result: CardFrontBack[] = [];
        for (const m of siblings) {
            const deletionStart: number = m.index,
                deletionEnd: number = deletionStart + m[0].length;
            front =
                questionText.substring(0, deletionStart) +
                QuestionType_ClozeUtil.renderClozeFront(m[0].length) +
                questionText.substring(deletionEnd);
            front = QuestionType_ClozeUtil.removeClozeTokens(front, settings);
            back =
                questionText.substring(0, deletionStart) +
                QuestionType_ClozeUtil.renderClozeBack(
                    questionText.substring(deletionStart, deletionEnd),
                ) +
                questionText.substring(deletionEnd);
            back = QuestionType_ClozeUtil.removeClozeTokens(back, settings);
            result.push(new CardFrontBack(front, back));
        }

        return result;
    }
}

export class QuestionType_ClozeUtil {
    static getSiblings(questionText: string, settings: SRSettings) {
        const siblings: RegExpMatchArray[] = [];
        if (settings.convertHighlightsToClozes) {
            siblings.push(...questionText.matchAll(/==(.*?)==/gm));
        }
        if (settings.convertBoldTextToClozes) {
            siblings.push(...questionText.matchAll(/\*\*(.*?)\*\*/gm));
        }
        if (settings.convertCurlyBracketsToClozes) {
            siblings.push(...questionText.matchAll(/{{(.*?)}}/gm));
        }
        siblings.sort((a, b) => {
            if (a.index < b.index) {
                return -1;
            }
            if (a.index > b.index) {
                return 1;
            }
            // What is unit test to cover following statement; otherwise jest please ignore
            return 0;
        });
        return siblings;
    }

    static convMultiCloze(siblings: Card[], questionText: string, settings: SRSettings): Card[] {
        const newsiblings = siblings.filter((card) => !card.isNew && !card.isDue);
        const idxs = siblings
            .map((card) => {
                if (card.isNew || card.isDue) {
                    return card.cardIdx;
                }
            })
            .filter((idx) => idx != undefined);
        if (idxs.length <= 1) return siblings;
        const textsibls = QuestionType_ClozeUtil.getSiblings(questionText, settings);
        let front: string = "",
            back: string;
        const ftsibls = textsibls.filter((v, idx) => idxs.includes(idx));
        // .sort((a, b) => b.index - a.index);
        let startIdx: number;
        ftsibls.filter((m0, sibIdx) => {
            // if (sibIdx === idxs.length - 1) {
            //     return;
            // }
            const deletionStart: number = m0.index,
                deletionEnd: number = deletionStart + m0[0].length;
            startIdx = deletionEnd;
            front =
                questionText.substring(0, m0.index) +
                QuestionType_ClozeUtil.renderClozeFront(m0[0].length);

            back =
                questionText.substring(0, deletionStart) +
                QuestionType_ClozeUtil.renderClozeBack(
                    questionText.substring(deletionStart, deletionEnd),
                );
            ftsibls.filter((m) => {
                if (m.index <= startIdx) {
                    return true;
                }
                const deletionStart: number = m.index,
                    deletionEnd: number = deletionStart + m[0].length;
                front =
                    front +
                    questionText.substring(startIdx, deletionStart) +
                    QuestionType_ClozeUtil.renderClozeFront(m[0].length);
                back =
                    back +
                    questionText.substring(startIdx, deletionStart) +
                    QuestionType_ClozeUtil.renderClozeFront(m[0].length);
                startIdx = deletionEnd;
                return true;
            });
            front = front + questionText.substring(startIdx);
            // front = QuestionType_ClozeUtil.removeClozeTokens(front, settings);
            back = back + questionText.substring(startIdx);
            back = QuestionType_ClozeUtil.removeClozeTokens(back, settings);
            siblings[idxs[sibIdx]].front = front;
            siblings[idxs[sibIdx]].back = back;
            siblings[idxs[sibIdx]].multiClozeIndex = sibIdx;
            siblings[idxs[sibIdx]].multiCloze = idxs;
        });
        return siblings;
    }

    static renderClozeFront(len: number = 3): string {
        const rpt = Math.max(1, Math.round(len / 6));
        return "<span style='color:#2196f3'>[" + "...".repeat(rpt) + "]</span>";
    }

    static renderClozeBack(str: string): string {
        return "<span style='color:#2196f3'>" + str + "</span>";
    }

    static removeClozeTokens(text: string, settings: SRSettings): string {
        let result: string = text;
        if (settings.convertHighlightsToClozes) result = result.replace(/==/gm, "");
        if (settings.convertBoldTextToClozes) result = result.replace(/\*\*/gm, "");
        if (settings.convertCurlyBracketsToClozes) {
            result = result.replace(/{{/gm, "").replace(/}}/gm, "");
        }
        return result;
    }
}

export class QuestionTypeFactory {
    static create(questionType: CardType): IQuestionTypeHandler {
        let handler: IQuestionTypeHandler;
        switch (questionType) {
            case CardType.SingleLineBasic:
                handler = new QuestionType_SingleLineBasic();
                break;
            case CardType.SingleLineReversed:
                handler = new QuestionType_SingleLineReversed();
                break;
            case CardType.MultiLineBasic:
                handler = new QuestionType_MultiLineBasic();
                break;
            case CardType.MultiLineReversed:
                handler = new QuestionType_MultiLineReversed();
                break;
            case CardType.Cloze:
                handler = new QuestionType_Cloze();
                break;
        }
        return handler;
    }
}
