import type { Lang } from "./i18n";
import type { PlatformSettings, Reporting } from "./types";

/**
 * Built-in user manual (English + Bangla). Admins can override any article by slug, hide it or add new ones
 * from the control panel (public.help_articles); `mergeManual` combines both.
 *
 * Body format: blank line = new paragraph, "## " heading, "- " bullet, "1. " numbered step, **bold**.
 * Live values from Settings: {{minAccountYears}} {{minReporting}} {{commitments}} {{trackingMonths}}
 * {{dueSoonDays}} {{deliveryMonths}}. When an admin changes a rule, the manual follows.
 */

export type Audience = "everyone" | "investor" | "business" | "admin";

export interface HelpArticle {
  slug: string;
  audience: Audience;
  order: number;
  title: Record<Lang, string>;
  body: Record<Lang, string>;
  hidden?: boolean;
  /** "built-in" (from this file), "edited" (built-in overridden by an admin) or "custom" (added by an admin). */
  source?: "built-in" | "edited" | "custom";
}

/** An admin edit as stored in public.help_articles. */
export interface HelpArticleRow {
  slug: string;
  audience: Audience;
  order: number;
  titleEn: string;
  titleBn: string;
  bodyEn: string;
  bodyBn: string;
  hidden: boolean;
  updatedAt?: string;
}

export const AUDIENCE_LABEL: Record<Audience, Record<Lang, string>> = {
  everyone: { en: "Getting started", bn: "শুরু করা" },
  investor: { en: "For investors", bn: "বিনিয়োগকারীদের জন্য" },
  business: { en: "For businesses", bn: "ব্যবসার জন্য" },
  admin: { en: "For admins", bn: "অ্যাডমিনদের জন্য" },
};

const REPORTING_TEXT: Record<Reporting, Record<Lang, string>> = {
  monthly: { en: "every month", bn: "প্রতি মাসে" },
  quarterly: { en: "every 3 months", bn: "প্রতি ৩ মাসে" },
  "half-yearly": { en: "every 6 months", bn: "প্রতি ৬ মাসে" },
};

export const BUILT_IN: HelpArticle[] = [
  /* ───────────── Everyone ───────────── */
  {
    slug: "what-is-fundbridge", audience: "everyone", order: 1,
    title: { en: "What FundBridge is", bn: "FundBridge কী" },
    body: {
      en: `FundBridge connects **businesses that need money to grow** with **investors** who want to back them. Only registered businesses verified by our team can raise funds.

## Three ways to raise money
- **Equity:** investors receive a share of the company.
- **Debt / lending:** investors lend money and are repaid with interest or profit share on a schedule.
- **Reward:** backers receive a product or perk instead of a financial return.

## Pledges
A pledge is a **non-binding promise** of an amount. No money is collected on FundBridge. If a campaign doesn't reach its goal, all pledges are released.

Investing in private businesses carries risk, including losing all the money you invest.`,
      bn: `FundBridge **বড় হতে টাকা দরকার এমন ব্যবসা** আর **তাদের পাশে দাঁড়াতে চান এমন বিনিয়োগকারীদের** মধ্যে সংযোগ তৈরি করে। শুধু আমাদের টিমের যাচাই করা নিবন্ধিত ব্যবসাই টাকা তুলতে পারে।

## টাকা তোলার তিনটি উপায়
- **ইকুইটি (শেয়ার):** বিনিয়োগকারীরা কোম্পানির একটি অংশের মালিক হন।
- **ঋণ / ধার:** বিনিয়োগকারীরা টাকা ধার দেন এবং নির্ধারিত সময়ে সুদ বা মুনাফাসহ ফেরত পান।
- **পুরস্কার (রিওয়ার্ড):** আর্থিক লাভের বদলে সমর্থকেরা পণ্য বা বিশেষ সুবিধা পান।

## প্লেজ (অঙ্গীকার)
প্লেজ হলো একটি নির্দিষ্ট অঙ্কের **বাধ্যতামূলক নয় এমন প্রতিশ্রুতি**। FundBridge-এ কোনো টাকা নেওয়া হয় না। ক্যাম্পেইন লক্ষ্যে না পৌঁছালে সব প্লেজ বাতিল হয়ে যায়।

ব্যক্তিগত ব্যবসায় বিনিয়োগে ঝুঁকি আছে, বিনিয়োগ করা পুরো টাকাও হারাতে পারেন।`,
    },
  },
  {
    slug: "account-and-login", audience: "everyone", order: 2,
    title: { en: "Creating an account and logging in", bn: "অ্যাকাউন্ট খোলা ও লগইন" },
    body: {
      en: `1. Click **Sign up** at the top of any page.
2. Choose **Investor** (to back businesses) or **Business** (to raise money).
3. Enter your name, email and a password of at least 8 characters.
4. Open the confirmation link we email you, then log in.

## Forgot your password?
On the **Log in** page, click **Forgot password?**, enter your email and open the reset link in the same browser.

## Admin accounts
Nobody can choose to be an admin when signing up. An existing admin can give someone the admin role from the control panel.`,
      bn: `1. যেকোনো পেজের উপরে **Sign up** চাপুন।
2. **Investor** (ব্যবসায় বিনিয়োগ করতে) অথবা **Business** (টাকা তুলতে) বেছে নিন।
3. নাম, ইমেইল আর কমপক্ষে ৮ অক্ষরের পাসওয়ার্ড দিন।
4. ইমেইলে আসা নিশ্চিতকরণ লিংকে ক্লিক করুন, তারপর লগইন করুন।

## পাসওয়ার্ড ভুলে গেছেন?
**Log in** পেজে **Forgot password?** চাপুন, ইমেইল দিন এবং একই ব্রাউজারে রিসেট লিংক খুলুন।

## অ্যাডমিন অ্যাকাউন্ট
সাইন আপের সময় কেউ নিজে অ্যাডমিন হতে পারে না। একজন অ্যাডমিন control panel থেকে অন্য কাউকে অ্যাডমিন বানাতে পারেন।`,
    },
  },

  /* ───────────── Investors ───────────── */
  {
    slug: "investor-preferences", audience: "investor", order: 10,
    title: { en: "Finding campaigns that fit you", bn: "আপনার উপযোগী ক্যাম্পেইন খোঁজা" },
    body: {
      en: `On your **Dashboard**, fill in **Investment preferences** and click **Save preferences**:
- **Sectors** and **locations** you're interested in (leave empty to see everything)
- **Deal types:** equity, debt or reward
- **Ticket size:** the least and most you'd put into one campaign
- **Risk tolerance:** low, medium or high

## Match score
Every campaign gets a **match score out of 100**: sector 35, deal type 20, ticket size 20, risk 15, location 10. On each campaign you'll see why it matches and anything worth noting, such as a risk above your tolerance.

**Browse campaigns** sorts by best match. You can also filter by type and sector, or search.`,
      bn: `**Dashboard**-এ **Investment preferences** পূরণ করে **Save preferences** চাপুন:
- আগ্রহের **সেক্টর** ও **এলাকা** (সব দেখতে চাইলে খালি রাখুন)
- **ধরন:** ইকুইটি, ঋণ বা পুরস্কার
- **বিনিয়োগের পরিমাণ:** একটি ক্যাম্পেইনে সর্বনিম্ন ও সর্বোচ্চ কত দিতে চান
- **ঝুঁকি নেওয়ার ক্ষমতা:** কম, মাঝারি বা বেশি

## ম্যাচ স্কোর
প্রতিটি ক্যাম্পেইন **১০০-র মধ্যে একটি ম্যাচ স্কোর** পায়: সেক্টর ৩৫, ধরন ২০, বিনিয়োগের পরিমাণ ২০, ঝুঁকি ১৫, এলাকা ১০। প্রতিটি ক্যাম্পেইনে দেখবেন কেন মিলছে এবং কোথায় সতর্ক থাকা উচিত, যেমন আপনার পছন্দের চেয়ে বেশি ঝুঁকি।

**Browse campaigns** সবচেয়ে ভালো মিল অনুযায়ী সাজায়। ধরন ও সেক্টর দিয়ে ফিল্টার বা খোঁজও করতে পারেন।`,
    },
  },
  {
    slug: "investor-reading-a-project", audience: "investor", order: 11,
    title: { en: "Reading a project page", bn: "প্রজেক্ট পেজ পড়া" },
    body: {
      en: `Each campaign has tabs. Read them all before you pledge.
- **Overview:** the pitch, deal terms and why it matches you.
- **Business:** what the business does, its highlights and team.
- **Accounts:** sales growth and profit margin for everyone. After you **log in** you also see full yearly results, forecasts and supporting documents (audited accounts, bank statements).
- **Plan:** exactly how the money will be used (it adds up to the goal), milestones, risks and how you get your return.
- **Commitments:** what the business promises you, how often it will send updates, and who to contact.
- **Q&A:** ask the founders anything; answers are public.

## "Accounts checked by FundBridge"
This badge means our team compared the figures with the documents the business uploaded. It isn't an audit or a guarantee.`,
      bn: `প্রতিটি ক্যাম্পেইনে কয়েকটি ট্যাব আছে। প্লেজ করার আগে সবগুলো পড়ুন।
- **Overview:** মূল প্রস্তাব, শর্তাবলি আর কেন আপনার সাথে মেলে।
- **Business:** ব্যবসাটি কী করে, এর অর্জন ও টিম।
- **Accounts:** বিক্রি বৃদ্ধি ও মুনাফার হার সবাই দেখতে পান। **লগইন** করলে বছরভিত্তিক পূর্ণ হিসাব, পূর্বাভাস ও প্রমাণপত্র (অডিট করা হিসাব, ব্যাংক স্টেটমেন্ট) দেখতে পাবেন।
- **Plan:** টাকা ঠিক কোথায় খরচ হবে (যোগফল লক্ষ্যের সমান), মাইলফলক, ঝুঁকি এবং আপনি কীভাবে লাভ বা টাকা ফেরত পাবেন।
- **Commitments:** ব্যবসাটি আপনাকে কী প্রতিশ্রুতি দিচ্ছে, কত ঘন ঘন আপডেট দেবে এবং কার সাথে যোগাযোগ করবেন।
- **Q&A:** উদ্যোক্তাদের যেকোনো প্রশ্ন করুন; উত্তর সবাই দেখতে পান।

## "Accounts checked by FundBridge"
এই চিহ্নের মানে আমাদের টিম ব্যবসার দেওয়া প্রমাণপত্রের সাথে হিসাব মিলিয়ে দেখেছে। এটি অডিট বা নিশ্চয়তা নয়।`,
    },
  },
  {
    slug: "investor-pledging", audience: "investor", order: 12,
    title: { en: "Pledging and cancelling", bn: "প্লেজ করা ও বাতিল করা" },
    body: {
      en: `1. Open a live campaign and enter an amount at or above the **minimum pledge**.
2. Tick the box to confirm you've read the business's **commitments** and understand the risk.
3. Click **Pledge**.

Your pledges are listed on your **Dashboard** under **My pledges**. You can cancel a pledge while the campaign is still open. Once a campaign is marked funded, pledges can no longer be cancelled from the site.`,
      bn: `1. একটি চলমান ক্যাম্পেইন খুলে **সর্বনিম্ন প্লেজ** বা তার বেশি অঙ্ক লিখুন।
2. বাক্সে টিক দিয়ে নিশ্চিত করুন যে আপনি ব্যবসার **প্রতিশ্রুতিগুলো** পড়েছেন এবং ঝুঁকি বুঝেছেন।
3. **Pledge** চাপুন।

আপনার প্লেজগুলো **Dashboard**-এ **My pledges** অংশে থাকে। ক্যাম্পেইন খোলা থাকা পর্যন্ত প্লেজ বাতিল করতে পারবেন। ক্যাম্পেইন "funded" হয়ে গেলে সাইট থেকে আর বাতিল করা যায় না।`,
    },
  },
  {
    slug: "investor-after-funding", audience: "investor", order: 13,
    title: { en: "After a campaign is funded", bn: "ক্যাম্পেইন ফান্ডেড হওয়ার পর" },
    body: {
      en: `When a campaign reaches its goal, FundBridge marks it **funded** and turns the business's promises into dated commitments: progress updates, yearly accounts, repayments, milestones and reward delivery. They're tracked for {{trackingMonths}} months.

- The campaign's **Progress** tab shows the track record (how many commitments were kept, and on time) and every commitment's status: **Done**, **Due soon** (within {{dueSoonDays}} days), **Upcoming**, **Overdue** or **Waived**.
- As a backer you can read the **updates** the business posts. Other visitors see only the commitment list.
- Your **Dashboard** warns you under **From your investments** when something is overdue.

If a business falls behind, contact the person named in its **Commitments** tab. FundBridge also follows up on overdue commitments.`,
      bn: `ক্যাম্পেইন লক্ষ্যে পৌঁছালে FundBridge সেটিকে **funded** করে এবং ব্যবসার প্রতিশ্রুতিগুলোকে তারিখসহ কাজে পরিণত করে: অগ্রগতির আপডেট, বার্ষিক হিসাব, কিস্তি পরিশোধ, মাইলফলক ও পুরস্কার পৌঁছানো। এগুলো {{trackingMonths}} মাস ধরে ট্র্যাক করা হয়।

- ক্যাম্পেইনের **Progress** ট্যাবে দেখবেন কতগুলো প্রতিশ্রুতি রাখা হয়েছে (এবং সময়মতো কিনা), আর প্রতিটির অবস্থা: **Done** (সম্পন্ন), **Due soon** ({{dueSoonDays}} দিনের মধ্যে), **Upcoming** (আসন্ন), **Overdue** (সময় পেরিয়েছে) বা **Waived** (মওকুফ)।
- সমর্থক হিসেবে আপনি ব্যবসার দেওয়া **আপডেটগুলো** পড়তে পারবেন। অন্যরা শুধু প্রতিশ্রুতির তালিকা দেখেন।
- কিছু সময় পেরিয়ে গেলে **Dashboard**-এর **From your investments** অংশে সতর্কবার্তা দেখাবে।

কোনো ব্যবসা পিছিয়ে পড়লে তাদের **Commitments** ট্যাবে দেওয়া ব্যক্তির সাথে যোগাযোগ করুন। FundBridge-ও সময় পেরোনো প্রতিশ্রুতির খোঁজ নেয়।`,
    },
  },

  /* ───────────── Businesses ───────────── */
  {
    slug: "business-verification", audience: "business", order: 20,
    title: { en: "Getting your business verified", bn: "ব্যবসা যাচাই করানো" },
    body: {
      en: `Only verified businesses can raise money.
1. On your **Dashboard**, fill in **Company profile**: registered name, trade licence number, TIN, sector, location, founding year and a short description.
2. Click **Save & submit for verification**.
3. Our team checks your details. You'll see the result on your dashboard; if something's wrong, the reason is shown so you can fix it and resubmit.

If you later change your company name, trade licence or TIN, your business goes back for review. Your TIN is never shown publicly.`,
      bn: `শুধু যাচাই করা ব্যবসাই টাকা তুলতে পারে।
1. **Dashboard**-এ **Company profile** পূরণ করুন: নিবন্ধিত নাম, ট্রেড লাইসেন্স নম্বর, TIN, সেক্টর, এলাকা, প্রতিষ্ঠার বছর ও সংক্ষিপ্ত বিবরণ।
2. **Save & submit for verification** চাপুন।
3. আমাদের টিম তথ্য যাচাই করবে। ফলাফল ড্যাশবোর্ডে দেখাবে; কোনো সমস্যা থাকলে কারণসহ দেখাবে, ঠিক করে আবার জমা দিতে পারবেন।

পরে কোম্পানির নাম, ট্রেড লাইসেন্স বা TIN বদলালে আবার যাচাই হবে। আপনার TIN কখনো প্রকাশ্যে দেখানো হয় না।`,
    },
  },
  {
    slug: "business-project-page", audience: "business", order: 21,
    title: { en: "Creating a campaign and its project page", bn: "ক্যাম্পেইন ও প্রজেক্ট পেজ তৈরি" },
    body: {
      en: `1. On your dashboard click **+ New campaign**. Enter the title, summary, type (equity, debt or reward), goal, minimum pledge, deadline and deal terms, then click **Save and build project page**.
2. Fill in the five steps. Save as often as you like; you can come back later.

## The steps
- **Business:** what you do (at least 50 characters), products, highlights and at least one team member.
- **Accounts:** results for at least **{{minAccountYears}} past years** (sales, costs, what you own and owe; profit is calculated), forecasts, and documents such as audited accounts (PDF or photo, up to 10 MB).
- **Plan:** use-of-funds items that **add up exactly to your goal**, milestones (write "Month 3" etc. so they can be tracked), risks with your plan for each, and how investors get their return.
- **Commitments:** see the separate article.
- **Review:** shows anything still missing, with a **Fix** link. When everything is complete, click **Submit for admin review**.

You can't edit the page while it's being reviewed. If the admin requests changes, you'll see which section and why; fix it and submit again.`,
      bn: `1. ড্যাশবোর্ডে **+ New campaign** চাপুন। শিরোনাম, সারসংক্ষেপ, ধরন (ইকুইটি, ঋণ বা পুরস্কার), লক্ষ্য, সর্বনিম্ন প্লেজ, শেষ তারিখ ও শর্ত লিখে **Save and build project page** চাপুন।
2. পাঁচটি ধাপ পূরণ করুন। যতবার খুশি সেভ করুন; পরে এসে আবার কাজ করতে পারবেন।

## ধাপগুলো
- **Business:** আপনি কী করেন (কমপক্ষে ৫০ অক্ষর), পণ্য, অর্জন এবং কমপক্ষে একজন টিম সদস্য।
- **Accounts:** কমপক্ষে **গত {{minAccountYears}} বছরের** হিসাব (বিক্রি, খরচ, সম্পদ ও দায়; মুনাফা নিজে থেকে হিসাব হয়), পূর্বাভাস এবং অডিট করা হিসাবের মতো প্রমাণপত্র (PDF বা ছবি, ১০ MB পর্যন্ত)।
- **Plan:** টাকা খরচের খাতগুলো, যার যোগফল **লক্ষ্যের ঠিক সমান** হতে হবে; মাইলফলক ("Month 3" এভাবে লিখুন যাতে ট্র্যাক করা যায়); ঝুঁকি ও প্রতিটির সমাধান; আর বিনিয়োগকারীরা কীভাবে লাভ পাবেন।
- **Commitments:** আলাদা নিবন্ধটি দেখুন।
- **Review:** কী বাকি আছে তা **Fix** লিংকসহ দেখায়। সব পূর্ণ হলে **Submit for admin review** চাপুন।

রিভিউ চলাকালে পেজ বদলানো যায় না। অ্যাডমিন পরিবর্তন চাইলে কোন অংশে ও কেন তা দেখতে পাবেন; ঠিক করে আবার জমা দিন।`,
    },
  },
  {
    slug: "business-commitments", audience: "business", order: 22,
    title: { en: "Your commitments to investors", bn: "বিনিয়োগকারীদের প্রতি আপনার প্রতিশ্রুতি" },
    body: {
      en: `Every business on FundBridge makes these standard commitments:
{{commitments}}

You also choose how often you'll send progress updates (at least **{{minReporting}}**), can add your own extra promises, and name the person investors can contact.

## The declaration
Tick the declaration and type your full name. We record the date and the exact commitments you accepted. Investors see them in your **Commitments** tab and confirm they've read them before pledging.`,
      bn: `FundBridge-এর প্রতিটি ব্যবসা এই প্রতিশ্রুতিগুলো দেয়:
{{commitments}}

এছাড়া আপনি ঠিক করবেন কত ঘন ঘন অগ্রগতির আপডেট দেবেন (কমপক্ষে **{{minReporting}}**), নিজের অতিরিক্ত প্রতিশ্রুতি যোগ করতে পারবেন এবং বিনিয়োগকারীরা কার সাথে যোগাযোগ করবেন তা জানাবেন।

## ঘোষণা
ঘোষণার বাক্সে টিক দিয়ে আপনার পুরো নাম লিখুন। আমরা তারিখ ও আপনার মেনে নেওয়া প্রতিশ্রুতিগুলো সংরক্ষণ করি। বিনিয়োগকারীরা আপনার **Commitments** ট্যাবে এগুলো দেখেন এবং প্লেজের আগে পড়েছেন বলে নিশ্চিত করেন।`,
    },
  },
  {
    slug: "business-after-funding", audience: "business", order: 23,
    title: { en: "After you're funded: keeping your commitments", bn: "ফান্ড পাওয়ার পর: প্রতিশ্রুতি রক্ষা" },
    body: {
      en: `When your campaign reaches its goal, FundBridge marks it funded and creates your commitments with due dates for the next {{trackingMonths}} months: progress updates, yearly accounts, each repayment in your schedule, "Month N" milestones, and reward delivery ({{deliveryMonths}} months after funding).

1. Your dashboard shows **Commitments to keep**, with anything overdue or due within {{dueSoonDays}} days.
2. Click **Post update** next to a commitment.
3. Write what happened: progress, how the money was spent, sales, and any problems with your plan to fix them. For a repayment, enter the amount repaid.
4. Click **Post update to backers**. The commitment is marked **Done**.

Investors and FundBridge see your track record, including anything overdue. If you need more time, tell FundBridge before the due date; an admin can move the date with a recorded reason.`,
      bn: `ক্যাম্পেইন লক্ষ্যে পৌঁছালে FundBridge সেটিকে funded করে এবং পরের {{trackingMonths}} মাসের জন্য তারিখসহ আপনার প্রতিশ্রুতি তৈরি করে: অগ্রগতির আপডেট, বার্ষিক হিসাব, আপনার সূচির প্রতিটি কিস্তি, "Month N" মাইলফলক এবং পুরস্কার পৌঁছানো (ফান্ড পাওয়ার {{deliveryMonths}} মাস পরে)।

1. ড্যাশবোর্ডে **Commitments to keep** অংশে সময় পেরোনো বা {{dueSoonDays}} দিনের মধ্যে যেগুলো করতে হবে সেগুলো দেখাবে।
2. প্রতিশ্রুতির পাশে **Post update** চাপুন।
3. কী হয়েছে লিখুন: অগ্রগতি, টাকা কীভাবে খরচ হয়েছে, বিক্রি, আর কোনো সমস্যা থাকলে তা সমাধানের পরিকল্পনা। কিস্তির ক্ষেত্রে পরিশোধ করা অঙ্ক লিখুন।
4. **Post update to backers** চাপুন। প্রতিশ্রুতিটি **Done** (সম্পন্ন) হয়ে যাবে।

বিনিয়োগকারী ও FundBridge আপনার রেকর্ড দেখেন, সময় পেরোনো কাজসহ। আরও সময় দরকার হলে নির্ধারিত তারিখের আগেই FundBridge-কে জানান; অ্যাডমিন কারণ লিখে তারিখ বদলাতে পারেন।`,
    },
  },

  /* ───────────── Admins ───────────── */
  {
    slug: "admin-reviewing", audience: "admin", order: 30,
    title: { en: "Reviewing businesses and campaigns", bn: "ব্যবসা ও ক্যাম্পেইন রিভিউ" },
    body: {
      en: `Open **Control panel → Overview**. **Needs your review** lists businesses waiting for verification and campaigns waiting for approval.

## Businesses
Compare the trade licence and TIN with official records, then **Verify** or **Reject** with a reason. In **Businesses** you can also revoke a verification.

## Campaigns
Each campaign shows whether its project page is complete, how many years of accounts and documents it has, and a link to the page.
- **Mark accounts checked** once you've compared the figures with the uploaded documents. Investors see the badge. If the business edits its accounts, the check is removed.
- **Approve** puts the campaign live (the business must be verified).
- **Request changes**: choose the section (Business, Accounts, Plan, Commitments) and explain what to fix.`,
      bn: `**Control panel → Overview** খুলুন। **Needs your review**-এ যাচাইয়ের অপেক্ষায় থাকা ব্যবসা আর অনুমোদনের অপেক্ষায় থাকা ক্যাম্পেইন দেখাবে।

## ব্যবসা
ট্রেড লাইসেন্স ও TIN সরকারি রেকর্ডের সাথে মিলিয়ে **Verify** করুন, অথবা কারণ লিখে **Reject** করুন। **Businesses** ট্যাব থেকে যাচাই বাতিলও করা যায়।

## ক্যাম্পেইন
প্রতিটি ক্যাম্পেইনে দেখাবে প্রজেক্ট পেজ পূর্ণ কিনা, কত বছরের হিসাব ও কয়টি প্রমাণপত্র আছে, আর পেজের লিংক।
- আপলোড করা প্রমাণপত্রের সাথে হিসাব মিলিয়ে **Mark accounts checked** চাপুন। বিনিয়োগকারীরা চিহ্নটি দেখবেন। ব্যবসা হিসাব বদলালে চিহ্নটি উঠে যায়।
- **Approve** চাপলে ক্যাম্পেইন চালু হয় (ব্যবসা যাচাই করা থাকতে হবে)।
- **Request changes**: অংশ বেছে নিন (Business, Accounts, Plan, Commitments) এবং কী ঠিক করতে হবে লিখুন।`,
    },
  },
  {
    slug: "admin-funding-and-tracking", audience: "admin", order: 31,
    title: { en: "Marking funded and tracking commitments", bn: "ফান্ডেড করা ও প্রতিশ্রুতি ট্র্যাকিং" },
    body: {
      en: `When a campaign has pledges for its full goal, open **Campaigns** and click **Mark funded**, choosing the date funding completed. The campaign closes and its commitments are created with due dates.

## Tracking tab
- **Track record by campaign:** how many commitments each business has kept, and on time.
- **Commitments:** filter by **Needs attention**, overdue, due soon, done or waived. **Reschedule** moves a due date and **Waive** cancels a commitment; both need a reason. A waived commitment can be reopened.
- **Latest updates:** remove an update that's improper (for example personal data); its commitment opens again.

The Overview shows a red alert whenever something is overdue.`,
      bn: `কোনো ক্যাম্পেইনে পুরো লক্ষ্যের প্লেজ হয়ে গেলে **Campaigns**-এ গিয়ে **Mark funded** চাপুন এবং ফান্ডিং শেষ হওয়ার তারিখ বেছে নিন। ক্যাম্পেইন বন্ধ হয় এবং তারিখসহ প্রতিশ্রুতি তৈরি হয়।

## Tracking ট্যাব
- **Track record by campaign:** প্রতিটি ব্যবসা কতগুলো প্রতিশ্রুতি রেখেছে এবং সময়মতো কিনা।
- **Commitments:** **Needs attention**, সময় পেরোনো, শিগগিরই করণীয়, সম্পন্ন বা মওকুফ দিয়ে ফিল্টার করুন। **Reschedule** দিয়ে তারিখ বদলান আর **Waive** দিয়ে মওকুফ করুন; দুটোতেই কারণ লাগবে। মওকুফ করা প্রতিশ্রুতি আবার খোলা যায়।
- **Latest updates:** অনুপযুক্ত আপডেট (যেমন ব্যক্তিগত তথ্য) মুছে ফেলুন; তখন সেই প্রতিশ্রুতি আবার খোলা হয়।

কিছু সময় পেরিয়ে গেলে Overview-তে লাল সতর্কবার্তা দেখায়।`,
    },
  },
  {
    slug: "admin-settings-and-manual", audience: "admin", order: 32,
    title: { en: "Users, settings, the manual and the activity log", bn: "ব্যবহারকারী, সেটিংস, ম্যানুয়াল ও কার্যক্রমের লগ" },
    body: {
      en: `- **Users:** change anyone's role (investor, business or admin). You can't change your own role, so there's always at least one admin.
- **Pledges** and **Q&A:** cancel a pledge or remove a question, with a reason.
- **Settings:** site announcement banner, sector and city lists, project-page rules (standard commitments, update frequency, years of accounts) and tracking rules. This manual updates automatically when those rules change.
- **Manual:** edit any article in English and Bangla, hide it, add new articles, or reset an article to its original text.
- **Activity log:** every admin action, with who did it, when and why. It can't be edited.`,
      bn: `- **Users:** যে কারও ভূমিকা বদলান (investor, business বা admin)। নিজের ভূমিকা বদলানো যায় না, তাই অন্তত একজন অ্যাডমিন সবসময় থাকেন।
- **Pledges** ও **Q&A:** কারণ লিখে প্লেজ বাতিল বা প্রশ্ন মুছে ফেলুন।
- **Settings:** সাইটের ঘোষণা, সেক্টর ও শহরের তালিকা, প্রজেক্ট পেজের নিয়ম (মানক প্রতিশ্রুতি, আপডেটের হার, হিসাবের বছর) এবং ট্র্যাকিংয়ের নিয়ম। এই নিয়ম বদলালে ম্যানুয়ালও নিজে থেকে বদলে যায়।
- **Manual:** যেকোনো নিবন্ধ ইংরেজি ও বাংলায় সম্পাদনা করুন, লুকিয়ে রাখুন, নতুন নিবন্ধ যোগ করুন বা মূল লেখায় ফিরিয়ে নিন।
- **Activity log:** প্রতিটি অ্যাডমিন কাজ, কে, কখন ও কেন করেছেন। এটি বদলানো যায় না।`,
    },
  },
];

/** Built-in articles with admin edits applied (same slug replaces; new slugs are added; hidden ones stay for admins). */
export function mergeManual(rows: HelpArticleRow[]): HelpArticle[] {
  const bySlug = new Map<string, HelpArticle>(BUILT_IN.map((a) => [a.slug, { ...a, source: "built-in" as const }]));
  for (const r of rows) {
    const builtIn = bySlug.get(r.slug);
    bySlug.set(r.slug, {
      slug: r.slug, audience: r.audience, order: r.order, hidden: r.hidden,
      title: { en: r.titleEn, bn: r.titleBn || r.titleEn },
      body: { en: r.bodyEn, bn: r.bodyBn || r.bodyEn },
      source: builtIn?.source === "built-in" || BUILT_IN.some((b) => b.slug === r.slug) ? "edited" : "custom",
    });
  }
  return [...bySlug.values()].sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
}

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
export const localDigits = (s: string, lang: Lang) => (lang === "bn" ? s.replace(/\d/g, (d) => BN_DIGITS[Number(d)]) : s);

/** Replaces {{placeholders}} with the platform's current rules, in the reader's language. */
export function fillPlaceholders(body: string, s: PlatformSettings, lang: Lang) {
  const n = (v: number) => localDigits(String(v), lang);
  return body
    .replace(/\{\{minAccountYears\}\}/g, n(s.minAccountYears))
    .replace(/\{\{minReporting\}\}/g, REPORTING_TEXT[s.minReporting][lang])
    .replace(/\{\{trackingMonths\}\}/g, n(s.trackingMonths))
    .replace(/\{\{dueSoonDays\}\}/g, n(s.dueSoonDays))
    .replace(/\{\{deliveryMonths\}\}/g, n(s.deliveryMonths))
    .replace(/\{\{commitments\}\}/g, s.commitmentOptions.map((c) => `- ${c}`).join("\n"));
}

/** Which audience a reader sees first. */
export const audienceFor = (role?: string): Audience =>
  role === "investor" || role === "business" || role === "admin" ? role : "everyone";
