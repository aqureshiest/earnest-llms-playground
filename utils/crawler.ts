//@ts-ignore
import Spider from "node-spider";
//@ts-ignore
import TurndownService from "turndown";
import { load } from "cheerio";
import parse from "url-parse";
const turndownService = new TurndownService();

export type Page = {
    url: string;
    text: string;
    title: string;
};
class Crawler {
    pages: Page[] = [];
    limit: number = 1000;
    urls: string[] = [];
    excludes: string[] = [];
    spider: Spider | null = {};
    count: number = 0;
    textLengthMinimum: number = 200;

    constructor(
        urls: string[],
        excludes: string[] = [],
        limit: number = 1000,
        textLengthMinimum: number = 200
    ) {
        this.urls = urls;
        this.excludes = excludes;
        this.limit = limit;
        this.textLengthMinimum = textLengthMinimum;

        this.count = 0;
        this.pages = [];
        this.spider = {};
    }

    handleRequest = (doc: any) => {
        const $ = load(doc.res.body);
        if (this.excludes.includes(doc.url)) return;
        $("script").remove();
        $("#hub-sidebar").remove();
        // $("header").remove();
        $("nav").remove();
        $("svg").remove();
        $("img").remove();
        $("style").remove();
        $("link[rel=stylesheet]").remove();
        const date = $("span.post-author-and-date__date").text();
        if (date && new Date(date).getFullYear() != 2023) {
            return;
        }
        const title = $("title").text().trim();
        const html = $("div#page").text().replace(/\s\s+/g, " ");
        // const text = turndownService.turndown(html || "");
        const text = html;
        console.log("crawling ", doc.url);
        const page: Page = {
            url: doc.url,
            text,
            title,
        };
        if (text.length > this.textLengthMinimum) {
            this.pages.push(page);
        }

        doc.$("a").each((i: number, elem: any) => {
            var href = doc.$(elem).attr("href")?.split("#")[0];
            var targetUrl = href && doc.resolve(href);
            // crawl more
            if (
                targetUrl &&
                this.urls.some((u) => {
                    const targetUrlParts = parse(targetUrl);
                    const uParts = parse(u);
                    return targetUrlParts.hostname === uParts.hostname;
                }) &&
                this.count < this.limit
            ) {
                this.spider.queue(targetUrl, this.handleRequest);
                this.count = this.count + 1;
            }
        });
    };

    start = async () => {
        this.pages = [];
        return new Promise((resolve, reject) => {
            this.spider = new Spider({
                concurrent: 5,
                delay: 0,
                allowDuplicates: false,
                catchErrors: true,
                addReferrer: false,
                xhr: false,
                keepAlive: false,
                error: (err: any, url: string) => {
                    console.log(err, url);
                    reject(err);
                },
                // Called when there are no more requests
                done: () => {
                    resolve(this.pages);
                },
                headers: { "user-agent": "node-spider" },
                encoding: "utf8",
            });
            this.urls.forEach((url) => {
                this.spider.queue(url, this.handleRequest);
            });
        });
    };
}

export { Crawler };
