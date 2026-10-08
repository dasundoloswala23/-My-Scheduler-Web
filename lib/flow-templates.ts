import type { FlowMode } from "./flow-types";

/**
 * A starting shape for a flow: a name, a mode and stage titles. A template
 * creates stages only. It never creates tasks; the user links the tasks they
 * already have, or adds new ones, afterwards. Same templates as the Flutter app.
 */
export interface FlowTemplate {
  id: string;
  name: string;
  description: string;
  stages: string[];
  mode: FlowMode;
}

export const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    id: "mobile_app_launch",
    name: "Mobile App Launch",
    description: "From first plan to a live app and what follows.",
    mode: "sequential",
    stages: [
      "Planning",
      "Development",
      "Internal QA",
      "Beta Testing",
      "Store Preparation",
      "Google Play",
      "App Store",
      "Marketing",
      "Post Launch",
    ],
  },
  {
    id: "website_launch",
    name: "Website Launch",
    description: "Plan, build, test and publish a website.",
    mode: "sequential",
    stages: ["Discovery", "Design", "Development", "Content", "Testing", "Launch", "Post Launch"],
  },
  {
    id: "client_project",
    name: "Client Project",
    description: "Deliver work for a client, from brief to hand-over.",
    mode: "sequential",
    stages: ["Brief", "Proposal", "Kick-off", "Delivery", "Review", "Hand-over", "Invoice"],
  },
  {
    id: "product_launch",
    name: "Product Launch",
    description: "Take a product to market.",
    mode: "sequential",
    stages: ["Research", "Product Definition", "Build", "Beta", "Go-to-market", "Launch", "Feedback"],
  },
  {
    id: "youtube_channel_launch",
    name: "YouTube Channel Launch",
    description: "Set up a channel and publish the first videos.",
    mode: "sequential",
    stages: [
      "Channel Concept",
      "Branding",
      "Equipment & Setup",
      "First Videos",
      "Publish",
      "Promote",
      "Review Analytics",
    ],
  },
  {
    id: "custom",
    name: "Custom",
    description: "Start empty and add your own stages.",
    mode: "flexible",
    stages: [],
  },
];

export const flowTemplateById = (id: string) => FLOW_TEMPLATES.find((t) => t.id === id);

// ------------------------------------------------------------------- advisor

/** Stages suggested for a goal such as "I want to launch my Flutter app". */
export interface FlowSuggestion {
  flowName: string;
  stages: string[];
  /** Plain words for where it came from, so a template is never mistaken for AI. */
  source: string;
}

/**
 * Suggests the stages of a flow from a description of a goal. Only a boundary:
 * a suggestion is a list of stage titles, nothing more. Accepting it creates
 * stages, never tasks, and the caller waits for the user to accept, edit or cancel.
 */
export interface FlowAdvisor {
  suggest(goal: string): Promise<FlowSuggestion>;
}

const KEYWORDS: [string, string[]][] = [
  ["mobile_app_launch", ["app", "flutter", "android", "ios", "mobile", "play store", "app store"]],
  ["website_launch", ["website", "web site", "site", "landing page", "web app"]],
  ["youtube_channel_launch", ["youtube", "channel", "vlog", "video series"]],
  ["product_launch", ["product", "launch", "release"]],
  ["client_project", ["client", "customer", "freelance", "contract"]],
];

/**
 * Matches words in the goal against the built-in templates. There is no AI behind
 * this and it does not claim there is: keyword matching, labelled as such.
 */
export const templateAdvisor: FlowAdvisor = {
  async suggest(goal) {
    const text = goal.toLowerCase();
    let best: FlowTemplate | undefined;
    let bestScore = 0;
    for (const [id, words] of KEYWORDS) {
      const score = words.filter((w) => text.includes(w)).length;
      if (score > bestScore) {
        bestScore = score;
        best = flowTemplateById(id);
      }
    }
    if (!best) return { flowName: "", stages: [], source: "No matching template" };
    return {
      flowName: best.name,
      stages: best.stages,
      source: `Built-in "${best.name}" template (keyword match, not AI)`,
    };
  },
};
