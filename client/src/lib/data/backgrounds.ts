export interface BackgroundData {
  id: string;
  name: string;
  description: string;
  skillProficiencies: string[];
  toolProficiencies?: string[];
  languages?: number;
  equipment: string[];
  feature: {
    name: string;
    description: string;
  };
  suggestedCharacteristics?: {
    personalityTraits: string[];
    ideals: string[];
    bonds: string[];
    flaws: string[];
  };
  variants?: {
    id: string;
    name: string;
    description: string;
    skillProficiencies?: string[];
  }[];
}

export const backgrounds: BackgroundData[] = [
  {
    id: "ace_pilot",
    name: "Ace Pilot",
    description:
      "You are a skilled and daring pilot, known for your exceptional abilities behind the controls of starships and other vehicles. Your reputation has been built on successful flights through asteroid fields, combat engagements, or high-stakes racing.",
    skillProficiencies: ["Perception", "Piloting"],
    toolProficiencies: ["Astrogation instruments", "One gaming set"],
    equipment: [
      "Flight suit",
      "Astrogation instruments",
      "A gaming set of your choice",
      "A trophy from a memorable flight",
      "A set of common clothes",
      "A pouch containing 10 credits",
    ],
    feature: {
      name: "Vehicle Familiarity",
      description:
        "You're familiar with most vehicles and can apply your expertise across different makes and models. When you encounter a new vehicle, you can determine its basic capabilities, systems, and potential flaws with a quick inspection. Additionally, your reputation as a pilot gives you access to piloting clubs, racetracks, and similar establishments where you can potentially borrow vehicles, get information, or find work.",
    },
    suggestedCharacteristics: {
      personalityTraits: [
        "I always push the limits of what I and my vehicle can do.",
        "I stay calm under pressure, even when facing imminent destruction.",
        "I constantly brag about my piloting exploits and compare everything to flying.",
        "I meticulously maintain any vehicle I pilot and treat it better than I treat most people.",
      ],
      ideals: [
        "Freedom: The open sky or starfield is where I belong, unbound by planetary constraints. (Chaotic)",
        "Precision: A perfect flight requires perfect execution and attention to detail. (Lawful)",
        "Speed: Nothing matters more than the thrill of pushing a vehicle to its absolute limits. (Any)",
        "Protection: I fly to keep others safe and transport them through danger. (Good)",
      ],
      bonds: [
        "My vehicle is my most treasured possession, and I prioritize its well-being above almost everything.",
        "I lost someone in a flight gone wrong, and I fly to honor their memory.",
        "I'm searching for a legendary vehicle said to be the fastest in the galaxy.",
        "There's a rival pilot I'm determined to outfly someday.",
      ],
      flaws: [
        "I take reckless risks to show off my skills.",
        "I don't believe anyone else can pilot as well as I can and rarely trust others to fly.",
        "I become irritable and anxious when I go too long without flying.",
        "I can't resist a wager on my piloting abilities, even when the stakes are dangerous.",
      ],
    },
  },
  {
    id: "bounty_hunter",
    name: "Bounty Hunter",
    description:
      "You make your living tracking down and capturing or killing targets for credits. Whether you're motivated by justice, profit, or thrill of the hunt, you've developed a particular set of skills that makes you effective at finding those who don't want to be found.",
    skillProficiencies: ["Investigation", "Survival"],
    languages: 1,
    equipment: [
      "Binders",
      "Tracking device",
      "Trophy from a successful hunt",
      "Common clothes",
      "Bounty puck (holographic wanted poster)",
      "Belt pouch containing 20 credits",
    ],
    feature: {
      name: "Guild Connection",
      description:
        "You have a contact within a bounty hunting guild or network who can provide you with information about available bounties in the region. Additionally, you can identify the signs that someone has a bounty on them, and you know the general protocols for turning in bounties in most major systems.",
    },
    suggestedCharacteristics: {
      personalityTraits: [
        "I'm cold, methodical, and emotionless when on a job.",
        "I always research my targets extensively before making a move.",
        "I quote the price of everyone I meet as if they were a potential bounty.",
        "I prefer to work alone, but I know when I need assistance.",
      ],
      ideals: [
        "Justice: I only hunt those who deserve punishment. (Lawful)",
        "Professional: Once I take a contract, I always complete it. (Lawful)",
        "Gain: I'll do nearly anything if the price is right. (Neutral)",
        "Honor: I have a strict code that I never violate, regardless of the bounty. (Any)",
      ],
      bonds: [
        "Someone important to me was taken by a criminal I'm still hunting.",
        "I'm using bounty hunting to fund something far more important to me.",
        "My reputation is everything in my line of work.",
        "I'm trying to atone for being on the wrong side of the law in my past.",
      ],
      flaws: [
        "I can't resist taking on a target that others have failed to catch.",
        "I treat everything like a hunt, even social situations.",
        "I'm ruthlessly efficient and sometimes overlook collateral damage.",
        "I have a nemesis who constantly interferes with my jobs.",
      ],
    },
  },
  {
    id: "criminal",
    name: "Criminal",
    description:
      "You have a history of breaking the law and living outside society's rules. Whether you were a professional thief, smuggler, or enforcer for a crime syndicate, you know how the criminal underworld operates.",
    skillProficiencies: ["Deception", "Stealth"],
    toolProficiencies: ["One type of gaming set", "Thieves' tools"],
    equipment: [
      "Crowbar",
      "Set of dark common clothes with a hood",
      "Thieves' tools",
      "Belt pouch containing 15 credits",
    ],
    feature: {
      name: "Criminal Contact",
      description:
        "You have a reliable contact who acts as your connection to a criminal network. You know how to get messages to and from this contact, even in remote regions, and you can call upon them for information or arrangements for low-level criminal services.",
    },
    variants: [
      {
        id: "smuggler",
        name: "Smuggler",
        description:
          "You specialize in moving illegal or regulated goods past authorities, knowing the best routes and methods to avoid detection.",
        skillProficiencies: ["Deception", "Piloting"],
      },
      {
        id: "spy",
        name: "Spy",
        description:
          "You gathered information for a government, corporation, or criminal organization, developing skills in subterfuge and intelligence gathering.",
        skillProficiencies: ["Deception", "Investigation"],
      },
    ],
    suggestedCharacteristics: {
      personalityTraits: [
        "I always have a plan for when things go wrong.",
        "I am always calm, no matter what the situation. I never raise my voice or let my emotions control me.",
        "The best way to get me to do something is to tell me I can't do it.",
        "I pocket anything I see that might have value.",
      ],
      ideals: [
        "Freedom: Chains are meant to be broken, as are those who would forge them. (Chaotic)",
        "Loyalty: I'm loyal to my friends, not to any ideals. (Neutral)",
        "Independence: I am a free spirit—no one tells me what to do. (Chaotic)",
        "Power: Everyone should be above the law, if they're strong enough. (Evil)",
      ],
      bonds: [
        "I'm trying to pay off a debt to a wealthy patron.",
        "I'm trying to clear my name after being framed for a crime I didn't commit.",
        "Someone I loved died because of a mistake I made. I'll never make that mistake again.",
        "I work to undermine an authority that destroyed my livelihood.",
      ],
      flaws: [
        'I have a "tell" that reveals when I\'m lying.',
        "I turn tail and run when things look bad.",
        "An innocent person is in prison for a crime I committed. I'm okay with that.",
        "I can't resist taking risks that might score me major credits.",
      ],
    },
  },
  {
    id: "force_adept",
    name: "Force Adept",
    description:
      "You received training in the ways of the Force from an unorthodox source—perhaps an isolated temple, a secretive order neither Jedi nor Sith, or a culture that has its own traditions of Force use. Your connection to the Force shapes your worldview and abilities.",
    skillProficiencies: ["Insight", "Lore"],
    languages: 1,
    equipment: [
      "Simple robes or identifying garments of your tradition",
      "A focus or talisman related to your Force training",
      "Incense and meditation materials",
      "Common clothes",
      "Belt pouch containing 10 credits",
    ],
    feature: {
      name: "Force Sensitivity",
      description:
        "You can sense disturbances in the Force and have intuitions about people, places, or objects that others might miss. Additionally, you know obscure knowledge about Force traditions and can identify Force-related artifacts or locations with greater ease than most.",
    },
    suggestedCharacteristics: {
      personalityTraits: [
        "I speak cryptically and often reference the will of the Force.",
        "I am extremely calm and reserved in most situations.",
        "I seek to understand all aspects of the Force, not just the narrow view of traditional orders.",
        "I carefully observe others, looking for signs of Force sensitivity or darkness.",
      ],
      ideals: [
        "Balance: All aspects of the Force must be understood and respected. (Neutral)",
        "Knowledge: Understanding the Force is a journey without end. (Any)",
        "Power: I seek mastery of the Force to achieve my own ends. (Any)",
        "Connection: Everything is connected through the Force, and thus all life is precious. (Good)",
      ],
      bonds: [
        "I seek a specific piece of ancient knowledge related to the Force.",
        "I'm determined to protect Force-sensitive children from those who would misuse their talents.",
        "My master was killed before my training was complete, and I seek to honor their memory.",
        "I must redeem myself for past misuse of my abilities.",
      ],
      flaws: [
        "I believe my connection to the Force makes my judgment superior to others.",
        "I struggle with emotional attachments due to my training.",
        "I'm overly secretive about my abilities and knowledge.",
        "I'm haunted by visions or premonitions that sometimes overwhelm me.",
      ],
    },
  },
  {
    id: "scholar",
    name: "Scholar",
    description:
      "You've spent years studying in archives, universities, or private collections, becoming an expert in a particular field of knowledge. Your academic background has given you insight into a wide range of subjects and analytical skills that others lack.",
    skillProficiencies: ["Investigation", "Lore"],
    languages: 2,
    equipment: [
      "Data pad filled with academic notes",
      "Writing implements",
      "Formal clothes",
      "Student ID or academic credentials",
      "Belt pouch containing 10 credits",
    ],
    feature: {
      name: "Academic Connection",
      description:
        "You have access to libraries, universities, and scholarly networks throughout the galaxy. You can leverage these connections to research information, gain entry to restricted archives, or find expert consultation on obscure topics. Fellow scholars are generally willing to assist you as a professional courtesy, expecting similar aid in return.",
    },
    variants: [
      {
        id: "archaeologist",
        name: "Archaeologist",
        description:
          "You specialize in uncovering and preserving the physical remains of ancient civilizations, particularly those with connections to the Force or forgotten technologies.",
        skillProficiencies: ["Athletics", "Lore"],
      },
      {
        id: "scientist",
        name: "Scientist",
        description:
          "You are trained in scientific methodology and research, focusing on fields like xenobiology, astrophysics, or advanced technology.",
        skillProficiencies: ["Medicine", "Technology"],
      },
    ],
    suggestedCharacteristics: {
      personalityTraits: [
        "I use complex words and technical jargon that often goes over people's heads.",
        "I relate everything that happens to something I've studied before.",
        "I'm used to helping others who don't know their way around books and laboratories.",
        "I get excited about discovering new knowledge, sometimes forgetting about danger.",
      ],
      ideals: [
        "Knowledge: The pursuit of knowledge is the highest calling. (Neutral)",
        "Preservation: Ancient wisdom and artifacts must be protected at all costs. (Lawful)",
        "Discovery: New insights are worth any risk. (Chaotic)",
        "Education: Knowledge belongs to everyone, not just the elite. (Good)",
      ],
      bonds: [
        "I've been searching my whole life for the answer to a specific question.",
        "My life's work is a series of tomes related to a specific field of study.",
        "I work to preserve the memory of a destroyed world or culture.",
        "I'm determined to prove a controversial theory that will revolutionize how people understand the galaxy.",
      ],
      flaws: [
        "I become completely absorbed in my research, ignoring everything else around me.",
        "I don't trust my instincts and constantly second-guess myself.",
        "I can't keep a secret to save my life, or anyone else's.",
        "I speak without thinking, often alienating others.",
      ],
    },
  },
  {
    id: "soldier",
    name: "Soldier",
    description:
      "You have served in a military organization, whether a planetary defense force, a mercenary company, or a galactic power's army. Your experience has made you tough, disciplined, and skilled in combat tactics.",
    skillProficiencies: ["Athletics", "Intimidation"],
    toolProficiencies: ["One type of gaming set", "Vehicles (land)"],
    equipment: [
      "Insignia of rank",
      "Trophy taken from a fallen enemy",
      "Set of bone dice or deck of cards",
      "Common clothes",
      "Belt pouch containing 10 credits",
    ],
    feature: {
      name: "Military Rank",
      description:
        "You hold a military rank from your previous service. Soldiers loyal to your former military organization still recognize your authority and influence, and they defer to you if they are of a lower rank. You can invoke your rank to exert influence over other soldiers and requisition simple equipment or horses for temporary use. You can also usually gain access to friendly military encampments and fortresses where your rank is recognized.",
    },
    variants: [
      {
        id: "medic",
        name: "Medic",
        description:
          "You served as a battlefield medic, treating wounds and saving lives under fire.",
        skillProficiencies: ["Medicine", "Insight"],
      },
      {
        id: "officer",
        name: "Officer",
        description:
          "You served as a commissioned officer, leading troops and making strategic decisions.",
        skillProficiencies: ["History", "Persuasion"],
      },
    ],
    suggestedCharacteristics: {
      personalityTraits: [
        "I'm always polite and respectful.",
        "I'm haunted by memories of war. I can't get the images of violence out of my mind.",
        "I'm slow to make new friends because many I've had have died in battle.",
        "I can stare down a rancor without flinching.",
      ],
      ideals: [
        "Greater Good: Our lot is to lay down our lives in defense of others. (Good)",
        "Responsibility: I do what I must and obey just authority. (Lawful)",
        "Independence: When people follow orders blindly, they embrace atrocity. (Chaotic)",
        "Might: In life as in war, the stronger force wins. (Evil)",
      ],
      bonds: [
        "I would still lay down my life for the people I served with.",
        "I fight for those who cannot fight for themselves.",
        "My unit was betrayed by a superior officer, and I seek to expose them.",
        "I lost too many friends in battle, and I will honor their memory.",
      ],
      flaws: [
        "The monstrous enemy we faced in battle still leaves me quivering with fear.",
        "I have little respect for anyone who is not a proven warrior.",
        "I obey the law, even if the law causes misery.",
        "I'd rather eat my durasteel boots than admit when I'm wrong.",
      ],
    },
  },
];
