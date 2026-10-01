import type { InventoryItem } from "@/lib/setupData";

export const MARSHAL_INVENTORY_INCIDENT_KEY = "marshalInventoryIncident";
export const MARSHAL_INVENTORY_REPEAT_KEY = "marshalInventoryRepeatAttempts";
export const MARSHAL_INVENTORY_DASHBOARD_MESSAGE_KEY = "marshalInventoryDashboardMessage";
export const PUMP_SPRAYERS_DESTROYED_KEY = "pumpSprayersDestroyed";
export const PUMP_SPRAYER_AUDIO_TRIGGERED_KEY = "pumpSprayerAudioTriggered";
export const PUMP_SPRAYER_AUDIO_URL = "/sounds/stop-breaking-law.mp3";

export type InventoryEgg = {
  message: string;
  button: string;
  blocksSave?: boolean;
};

export type InventoryEggSequence = InventoryEgg | InventoryEgg[];

export function normalizeInventoryName(name: string) {
  return name.trim().toLowerCase();
}

export function isMarshalInventoryName(name: string) {
  return normalizeInventoryName(name) === "marshal";
}

export function isPumpSprayerInventoryName(name: string) {
  const normalized = normalizeInventoryName(name);
  return normalized === "pump sprayer" || normalized === "pump sprayers";
}

function nameInventoryEgg(name: string, quantity: number): InventoryEggSequence | null {
  if (name === "r12" || name === "r-12") {
    if (quantity > 0) {
      return [
        { message: "AYYYE WE RIDIN COLD 🥶", button: "HELL YEAH" },
        { message: "...Wait. R12?", button: "Yep." },
        { message: "I didn't see nothin'.", button: "You didn't see nothin'." },
      ];
    }
  }

  if (name === "r134a" || name === "r-134a") {
    return { message: "Okay, modern technology.", button: "Still cold" };
  }

  if (name === "r1234yf" || name === "r-1234yf") {
    return { message: "HOW MUCH FOR A CAN?!", button: "Financial damage" };
  }

  if ((name === "catalytic converter" || name === "catalytic converters") && quantity >= 10) {
    return [
      { message: "...Why do you have that many catalytic converters?", button: "Don't worry about it" },
      { message: "You know what? I didn't see nothin'.", button: "Smart" },
    ];
  }

  if (name === "free catalytic converters") {
    return [
      { message: "Where'd you get these?", button: "Don't worry about it" },
      { message: ":|", button: "Marshal." },
      { message: "I didn't see nothin'.", button: "My man." },
    ];
  }

  if (name === "copper wire" && quantity >= 500) {
    return [
      { message: "That's... a lot of copper.", button: "Yep." },
      { message: "I didn't see nothin'.", button: "No you didn't" },
    ];
  }

  if ((name === "license plate" || name === "license plates") && quantity >= 10) {
    return [
      { message: "I'm not even gonna ask.", button: "Good." },
      { message: "I didn't see nothin'.", button: "Smart" },
    ];
  }

  if ((name === "airbag" || name === "airbags") && quantity >= 20) {
    return [
      { message: "Where exactly did all these come from?", button: "Don't worry about it" },
      { message: "Actually—nope. I didn't see nothin'.", button: "Keep scrolling" },
    ];
  }

  if ((name === "ecu" || name === "ecus") && quantity >= 25) {
    return [
      { message: "Huh.", button: "What?" },
      { message: "That's somebody else's problem. I didn't see nothin'.", button: "Correct" },
    ];
  }

  if ((name === "car keys" || name === "car key") && quantity >= 30) {
    return [
      { message: "Dude.", button: "What?" },
      { message: "...I didn't see nothin'.", button: "🤫" },
    ];
  }

  if ((name === "vin plate" || name === "vin plates") && quantity > 1) {
    return [
      { message: "NOPE.", button: "What?" },
      { message: "I didn't see nothin'.", button: "Walk away" },
    ];
  }

  if (name === "mystery parts" || name === "mystery part") {
    return [
      { message: "You know what?", button: "What?" },
      { message: "I didn't see nothin'.", button: "Exactly" },
    ];
  }

  if (name === "definitely legal") {
    return [
      { message: "That name is doing a LOT of work.", button: "It's fine" },
      { message: "I didn't see nothin'.", button: "Good." },
    ];
  }

  if (name === "bad driver") {
    return { message: "Dats Funny", button: "I know one" };
  }

  if (name === "common sense") {
    if (quantity === 0) {
      return [
        { message: "Yeah, we're backordered.", button: "ETA?" },
        { message: "Unknown.", button: "Figures." },
      ];
    }
    if (quantity >= 999) return { message: "Dats Funny", button: ":)" };
    if (quantity > 0) return { message: "Where'd you find that?", button: "Rare supplier" };
  }

  if (name === "10mm socket" || name === "10 mm socket" || name === "10mm" || name === "10 mm") {
    if (quantity === 0) return { message: "Of course.", button: "It's gone." };
    if (quantity === 1) return { message: "Don't get attached.", button: "I won't." };
    if (quantity >= 25) return { message: "Bullshit.", button: "Count 'em" };
  }

  if (name === "elbow grease") {
    return { message: "Aisle 7. Next to the headlight fluid.", button: "Got it" };
  }

  if (name === "muffler bearing" || name === "muffler bearings") {
    return { message: "Oh absolutely. Better order two.", button: "Critical part" };
  }

  if (name === "blinker fluid") {
    if (quantity === 0) return { message: "CRITICAL INVENTORY ALERT\n\nBlinker fluid depleted.", button: "Dear God." };
    if (quantity > 0) return { message: "Premium or synthetic?", button: "Synthetic" };
  }

  if (name === "headlight fluid") {
    return { message: "Low beam or high beam?", button: "High beam" };
  }

  if (name === "left-handed screwdriver" || name === "left handed screwdriver") {
    return { message: "Finally. We've been looking everywhere for one.", button: "Found it" };
  }

  if (name === "piston return spring" || name === "piston return springs") {
    return { message: "Make sure it's calibrated.", button: "Obviously" };
  }

  if (name === "winter air") {
    return { message: "Don't mix it with the summer air.", button: "Right." };
  }

  if (name === "summer air") {
    return { message: "Check the tire season first.", button: "Naturally" };
  }

  if (name === "flux capacitor") {
    if (quantity === 0) return { message: "Well, we're stuck here now.", button: "Damn." };
    if (quantity === 1) return { message: "Great Scott.", button: "88 MPH" };
  }

  if ((name === "hammer" || name === "hammers") && quantity >= 100) {
    return { message: "Planning on fixing a Toyota?", button: "Maybe." };
  }

  if ((name === "zip ties" || name === "zip tie" || name === "zip-ties" || name === "zip-tie") && quantity >= 1000) {
    return { message: "Engineering department fully stocked.", button: "Perfect" };
  }

  if (name === "duct tape" && quantity >= 100) {
    return { message: "Structural supplies look good.", button: "Send it" };
  }

  if (name === "giggity") {
    return [
      { message: "Giggity.", button: "Giggity" },
      { message: "Giggity giggity.", button: "Go on..." },
      { message: "ALLLL RIIIIGHT.", button: "😏" },
    ];
  }

  return null;
}

export function pumpSprayerInventoryEgg(previousQuantity: number, nextQuantity: number): InventoryEggSequence | null {
  if (nextQuantity === previousQuantity) return null;

  const destroyedCount = Number(localStorage.getItem(PUMP_SPRAYERS_DESTROYED_KEY) ?? "0");

  if (nextQuantity > previousQuantity) {
    if (destroyedCount >= 2) return { message: "Harbor Freight again?", button: "Mind your business" };
    if (destroyedCount >= 1) return { message: "Harbor Freight run?", button: "Yep." };
    return null;
  }

  const nextDestroyedCount = destroyedCount + 1;
  localStorage.setItem(PUMP_SPRAYERS_DESTROYED_KEY, String(nextDestroyedCount));

  switch (nextDestroyedCount) {
    case 1:
      return [
        { message: "...", button: "What?" },
        { message: "You blew it up, didn't you?", button: "...maybe" },
      ];
    case 2:
      return { message: "STOP BLOWING THEM UP.", button: "IT WAS AN ACCIDENT" };
    case 3:
      return [
        { message: "DUDE.", button: "What" },
        { message: "HOW DO YOU KEEP DOING THIS?", button: "Skill" },
      ];
    case 4:
      return { message: "STOP BREAKING THE LAW, ASSHOLE!", button: ":(" };
    default:
      return { message: "I'm not even surprised anymore.", button: "Character development" };
  }
}

export function genericInventoryEgg(item: InventoryItem): InventoryEggSequence | null {
  const name = normalizeInventoryName(item.name);
  const quantity = Number(item.quantity);
  const threshold = Number(item.minThreshold);

  if (!item.name.trim()) {
    return { message: "It needs a name, chief.", button: "Right.", blocksSave: true };
  }

  if (quantity < 0) {
    return { message: "D:", button: "Whoops", blocksSave: true };
  }

  const nameEgg = nameInventoryEgg(name, quantity);
  if (nameEgg) return nameEgg;

  if (name === "test" || name === "testing" || name === "asdf") {
    return { message: "Oh, very creative.", button: "Thank you" };
  }

  if (threshold > quantity) {
    return { message: "You know this means it's already low, right?", button: "That's the point" };
  }

  if (quantity === 0 && threshold === 0) {
    return { message: "So... we're tracking nothing?", button: "Apparently" };
  }

  switch (quantity) {
    case 69:
      return { message: "Hey, don't be cute.", button: "Fine" };
    case 420:
      return { message: "Are you doing this to piss me off?", button: "Noooo..." };
    case 6969:
      return { message: "Dude, no.", button: "Dude, yes." };
    case 80085:
      return { message: "No.", button: "Okay :(" };
    case 69420:
      return {
        message: "Okay, now you're just taking the piss. See! I'm British now, look at what you did.",
        button: "My bad",
      };
    case 8008135:
      return { message: ":|", button: "..." };
    case 123456789:
      return { message: "You don't have that many.", button: "You don't know me" };
    case 999999999:
      return { message: "Be serious.", button: "Never" };
    default:
      return null;
  }
}
