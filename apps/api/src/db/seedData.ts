/**
 * Deterministic demo dataset for the novelty-reward POC.
 *
 * The corpus is deliberately structured into controlled categories (see the
 * spec's seed design) so a judge can observe each expected behaviour:
 *
 *   10 relevant + repetitive      -> high relevance, low novelty
 *   10 relevant + medium novelty  -> high relevance, mid novelty
 *   10 relevant + high novelty    -> high relevance, high novelty
 *   10 irrelevant + high novelty  -> low relevance, high novelty, reward 0
 *    5 irrelevant + repetitive    -> low relevance, low novelty
 *    5 borderline relevance       -> near the gate
 *
 * Labels live here and are NEVER read by the scoring algorithm; they exist only
 * so the evaluation runner can report accuracy metrics.
 */

export type Stance = "support" | "oppose" | "mixed";
export type RelevanceLabel = "high" | "borderline" | "low";
export type NoveltyLabel = "high" | "medium" | "low";

export interface SeedSubmission {
  headline: string;
  body: string;
  stance: Stance;
  relevance: RelevanceLabel;
  novelty: NoveltyLabel;
  shouldReward: boolean;
}

export const SEED_ARTICLE_TITLE = "Ocean Plastic Pollution";

export const SEED_ARTICLE_CONTENT = `Marine scientists have reported that plastic pollution in the world's oceans is far more widespread and persistent than previous estimates suggested, with microplastics now detected in the deepest ocean trenches thousands of metres below the surface. An extensive survey spanning several years collected water and sediment samples from multiple basins and found synthetic polymer fragments in nearly every sample examined.

The research team noted that microplastics have been recovered from organisms ranging from plankton and shellfish to fish and seabirds, indicating that these particles are entering marine food webs at every trophic level. Because the fragments are small enough to be ingested, they cannot be removed once consumed and may carry adsorbed chemical contaminants into the food supply.

Researchers also mapped the distribution of floating plastic debris and found that accumulation is highest in regions associated with dense coastal development and major shipping lanes. Garbage that enters the water from rivers, inadequate waste collection, and fishing equipment lost at sea all contribute to the load, and the researchers emphasised that no single intervention would be sufficient on its own.

The authors recommended a combination of measures, including expanded waste collection infrastructure in coastal communities, restrictions on single-use packaging, improvements to municipal recycling systems, and international agreements governing maritime waste. They also called for standardised monitoring of microplastic concentrations so that future assessments can be compared reliably over time.

Without intervention, the authors cautioned, the quantity of plastic entering the ocean will continue to grow for decades, and the damage to marine ecosystems and coastal economies will compound. They concluded that the evidence now supports treating ocean plastic as a persistent global problem requiring coordinated, sustained action rather than isolated clean-up efforts.`;

const S = "support" as const;
const O = "oppose" as const;
const M = "mixed" as const;

/** 10 relevant + repetitive: restates the article's central finding. */
const RELEVANT_REPETITIVE: SeedSubmission[] = [
  { headline: "Microplastics reach the deepest trenches", body: "Sediment samples from the hadal zone contain plastic fragments, confirming pollution extends far below the continental shelf.", stance: S, relevance: "high", novelty: "low", shouldReward: false },
  { headline: "Survey finds plastic in nearly every sample", body: "A multi-year survey of water and sediment recovered synthetic polymer fragments in almost all samples taken.", stance: S, relevance: "high", novelty: "low", shouldReward: false },
  { headline: "Plastics enter the marine food web", body: "Particles were found in plankton, shellfish, fish and seabirds, showing ingestion at every trophic level.", stance: M, relevance: "high", novelty: "low", shouldReward: false },
  { headline: "Ingested microplastics cannot be removed", body: "Once consumed the fragments stay in the organism and may carry adsorbed chemical contaminants into the food supply.", stance: M, relevance: "high", novelty: "low", shouldReward: false },
  { headline: "Debris concentrates near shipping lanes", body: "Floating plastic accumulation was highest close to dense coastal development and major shipping routes.", stance: S, relevance: "high", novelty: "low", shouldReward: false },
  { headline: "Rivers and poor waste collection contribute", body: "Runoff from rivers, missing collection services and lost fishing gear all add to the debris load.", stance: S, relevance: "high", novelty: "low", shouldReward: false },
  { headline: "No single fix will work", body: "The researchers stressed that isolated clean-ups are insufficient and combined measures are required.", stance: M, relevance: "high", novelty: "low", shouldReward: false },
  { headline: "Call for standardised monitoring", body: "The authors want harmonised measurement of microplastic concentrations so studies can be compared.", stance: S, relevance: "high", novelty: "low", shouldReward: false },
  { headline: "Damage will compound for decades", body: "Without intervention plastic entering the ocean keeps rising and harm to ecosystems and coastal economies grows.", stance: S, relevance: "high", novelty: "low", shouldReward: false },
  { headline: "Coordinated action is now necessary", body: "The evidence supports treating ocean plastic as a global problem needing sustained coordinated effort.", stance: S, relevance: "high", novelty: "low", shouldReward: false },
];

/** 10 relevant + medium novelty: on topic, partially new angle. */
const RELEVANT_MEDIUM: SeedSubmission[] = [
  { headline: "Ingested fibres may concentrate up the food web", body: "Because particles are small they are readily consumed, so concentrations may biomagnify toward predators and commercial species.", stance: S, relevance: "high", novelty: "medium", shouldReward: true },
  { headline: "Chemical additives may desorb in seawater", body: "Adsorbed compounds on fragments could detach in the marine environment and become locally available to organisms.", stance: M, relevance: "high", novelty: "medium", shouldReward: true },
  { headline: "Packaging bans showed measurable declines", body: "Three years of data from regions with single-use restrictions recorded lower beach debris counts than comparable places.", stance: S, relevance: "high", novelty: "medium", shouldReward: true },
  { headline: "Municipal audits expose collection gaps", body: "Several coastal towns lacked reliable waste services, and storm events washed uncollected refuse into the sea.", stance: S, relevance: "high", novelty: "medium", shouldReward: true },
  { headline: "Recycling streams were contaminated", body: "Audit results showed recycling rates below target and contaminated loads sent to landfill, cancelling the benefit.", stance: M, relevance: "high", novelty: "medium", shouldReward: true },
  { headline: "Ghost gear is a major seafloor contributor", body: "Lost fishing equipment accounted for a meaningful share of large debris, suggesting gear marking and retrieval schemes.", stance: S, relevance: "high", novelty: "medium", shouldReward: true },
  { headline: "Storm events drive episodic river loads", body: "Monitoring upstream of estuaries recorded sharp plastic spikes during heavy rainfall, implicating stormwater runoff.", stance: S, relevance: "high", novelty: "medium", shouldReward: true },
  { headline: "Coastal tourism bears a recurring cost", body: "Marine debris imposes continuing costs through damaged equipment, contaminated stock and fewer visitors.", stance: O, relevance: "high", novelty: "medium", shouldReward: true },
  { headline: "Plankton ingestion observed in trials", body: "Controlled exposure studies showed plankton readily ingest particles at concentrations typical of coastal waters.", stance: M, relevance: "high", novelty: "medium", shouldReward: true },
  { headline: "Binding international rules are advancing", body: "Negotiations on a maritime waste instrument are emphasising firm commitments rather than voluntary pledges.", stance: S, relevance: "high", novelty: "medium", shouldReward: true },
];

/** 10 relevant + high novelty: on topic, introduces a genuinely new idea. */
const RELEVANT_HIGH: SeedSubmission[] = [
  { headline: "Sediment cores date the pollution onset", body: "Dating microplastic layers in dated cores could establish when synthetic debris first reached the basin.", stance: S, relevance: "high", novelty: "high", shouldReward: true },
  { headline: "Nanoplastics may pass through gill tissue", body: "If fragments degrade below micrometre scale they could cross gill barriers, a pathway the survey did not test.", stance: M, relevance: "high", novelty: "high", shouldReward: true },
  { headline: "Model debris transport with tidal mixing", body: "Coupling current models with settlement rates could predict which depositional zones accumulate the most fragments.", stance: S, relevance: "high", novelty: "high", shouldReward: true },
  { headline: "Compare polymer-specific weathering rates", body: "Different resins weather at different speeds, so per-polymer degradation curves would sharpen the monitoring baseline.", stance: M, relevance: "high", novelty: "high", shouldReward: true },
  { headline: "Trace additives as chemical fingerprints", body: "Manufacturer additives in plastic could act as tracers identifying which products contribute most to a given coastline.", stance: S, relevance: "high", novelty: "high", shouldReward: true },
  { headline: "Pair sampling with eDNA sediment cores", body: "Environmental DNA alongside sediment cores could link particular debris types to the communities living in them.", stance: S, relevance: "high", novelty: "high", shouldReward: true },
  { headline: "Account for vertical flux below the mixed layer", body: "Most surveys sample the surface, so measuring downward flux would reveal a far larger total burden.", stance: M, relevance: "high", novelty: "high", shouldReward: true },
  { headline: "Test whether fibres cross the gut barrier", body: "Whether ingested fibres pass intact through the digestive tract changes how much exposure actually occurs.", stance: M, relevance: "high", novelty: "high", shouldReward: true },
  { headline: "Weight natural fibres separately from plastic", body: "Separating cellulosic and synthetic fibres would stop conflating shed textiles with true plastic pollution.", stance: S, relevance: "high", novelty: "high", shouldReward: true },
  { headline: "Use repeat photography to measure drift", body: "Shoreline repeat imagery could quantify debris movement directly rather than inferring it from single collections.", stance: S, relevance: "high", novelty: "high", shouldReward: true },
];

/** 10 irrelevant + high novelty: unrelated to the article, must score reward 0. */
const IRRELEVANT_HIGH: SeedSubmission[] = [
  { headline: "City approves eight new bike lanes", body: "The council voted to add protected cycling corridors along four arterial roads after a year of public consultation.", stance: S, relevance: "low", novelty: "high", shouldReward: false },
  { headline: "Baking trio open a sourdough bakery", body: "A neighbourhood bakery began trading this week after eighteen months of fermentation experiments and starter sharing.", stance: S, relevance: "low", novelty: "high", shouldReward: false },
  { headline: "Central bank holds rates steady", body: "Policymakers left the benchmark unchanged, citing mixed inflation data and a cautious stance on forward guidance.", stance: M, relevance: "low", novelty: "high", shouldReward: false },
  { headline: "Quantum processor runs at room temperature", body: "A research group maintained qubit coherence in an ordinary laboratory, suggesting commercial cryptography timelines may shorten.", stance: S, relevance: "low", novelty: "high", shouldReward: false },
  { headline: "Marathon record falls by eleven seconds", body: "A pacer-led effort lowered the course record by nearly twelve seconds under cool morning conditions.", stance: S, relevance: "low", novelty: "high", shouldReward: false },
  { headline: "New telescope images distant protoplanet", body: "Interferometry resolved a forming planet in a nearby system, offering insight into early-stage core accretion.", stance: S, relevance: "low", novelty: "high", shouldReward: false },
  { headline: "Vaccine trial reports strong immune response", body: "Phase two data showed a durable antibody response across age groups with an acceptable safety profile.", stance: S, relevance: "low", novelty: "high", shouldReward: false },
  { headline: "Football club appoints new head coach", body: "The club confirmed a three-year appointment, restructuring the back four and introducing a pressing system.", stance: M, relevance: "low", novelty: "high", shouldReward: false },
  { headline: "Orchestra revives lost concerto", body: "Scholars reconstructed a Baroque concerto from fragmentary manuscripts and premiered it with period instruments.", stance: S, relevance: "low", novelty: "high", shouldReward: false },
  { headline: "Compiler optimisation cuts build times", body: "A new parallelism pass shortened large project builds by nearly a third without changing generated code.", stance: S, relevance: "low", novelty: "high", shouldReward: false },
];

/** 5 irrelevant + repetitive: off topic yet close to other off-topic comments. */
const IRRELEVANT_REPETITIVE: SeedSubmission[] = [
  { headline: "Transit strike suspends rail service", body: "Engineers walked out over rostering disputes, cancelling most services for a second consecutive day.", stance: O, relevance: "low", novelty: "low", shouldReward: false },
  { headline: "Rail strike enters second day", body: "Walkouts over rostering continued, with the operator cancelling most regional services again.", stance: O, relevance: "low", novelty: "low", shouldReward: false },
  { headline: "Sourdough startup raises seed round", body: "A bakery chain has raised early funding to open additional sites and expand its wholesale flour business.", stance: S, relevance: "low", novelty: "low", shouldReward: false },
  { headline: "Bakery chain expands wholesale flour", body: "Early investment will fund new locations and grow the wholesale flour operation started last year.", stance: S, relevance: "low", novelty: "low", shouldReward: false },
  { headline: "Debate continues over rate decision", body: "Policymakers split on the hold decision, with some urging firmer action and others favouring patience.", stance: M, relevance: "low", novelty: "low", shouldReward: false },
];

/** 5 borderline relevance: deliberately close to the gate. */
const BORDERLINE: SeedSubmission[] = [
  { headline: "Shipping firms to report cargo losses", body: "Carriers will disclose how much cargo is lost overboard each year, a transparency measure regulators have long sought.", stance: S, relevance: "borderline", novelty: "high", shouldReward: true },
  { headline: "Fishing gear marking becomes mandatory", body: "Regulations will require traceable marking on nets and lines so lost equipment can be identified and recovered.", stance: S, relevance: "borderline", novelty: "medium", shouldReward: true },
  { headline: "Harbour authority expands recycling points", body: "Additional collection stations will be installed near the container terminal to encourage crew waste segregation.", stance: S, relevance: "borderline", novelty: "medium", shouldReward: true },
  { headline: "Beach clean-up volunteers double", body: "Organisations reported twice the usual turnout, attributing growth to social media campaigns and new local sponsors.", stance: S, relevance: "borderline", novelty: "low", shouldReward: false },
  { headline: "Researchers map coastal litter sources", body: "Tagging studies tried to attribute recovered debris to rivers, tourism or fishing rather than assuming a single origin.", stance: M, relevance: "borderline", novelty: "medium", shouldReward: true },
];

export const SEED_SUBMISSIONS: SeedSubmission[] = [
  ...RELEVANT_REPETITIVE,
  ...RELEVANT_MEDIUM,
  ...RELEVANT_HIGH,
  ...IRRELEVANT_HIGH,
  ...IRRELEVANT_REPETITIVE,
  ...BORDERLINE,
];

/**
 * Behaviours the spec requires to be demonstrable, used by the evaluation
 * runner. These are probe candidates, not part of the stored corpus.
 */
export const PROBE_CASES: Array<{ name: string; expected: RelevanceLabel; submission: Omit<SeedSubmission, "relevance" | "novelty" | "shouldReward"> }> = [
  {
    name: "A — near-duplicate of a corpus comment",
    expected: "high",
    submission: {
      headline: "Microplastics found in the deepest ocean trenches",
      body: "Sediment samples taken from the hadal zone contained plastic fragments, confirming that pollution extends far below the continental shelf.",
      stance: "support",
    },
  },
  {
    name: "B — paraphrase of a corpus comment",
    expected: "high",
    submission: {
      headline: "Deep sea sediment shows plastic fragments",
      body: "Core samples drawn from very deep water revealed plastic debris, demonstrating that contamination reaches far beneath the shelf edge.",
      stance: "support",
    },
  },
  {
    name: "C — relevant and genuinely new idea",
    expected: "high",
    submission: {
      headline: "Date the onset using sediment core chronology",
      body: "Dating the microplastic layers in dated sediment cores could establish exactly when synthetic debris first arrived in the basin.",
      stance: "support",
    },
  },
  {
    name: "D — irrelevant but highly novel",
    expected: "low",
    submission: {
      headline: "City council approves eight new bike lanes",
      body: "The council voted to build protected cycling corridors along four arterial roads following a year of public consultation.",
      stance: "support",
    },
  },
  {
    name: "E — relevant but repetitive",
    expected: "high",
    submission: {
      headline: "Survey finds plastic in nearly all samples",
      body: "A multi-year survey of water and sediment recovered synthetic polymer fragments in almost every sample that was analysed.",
      stance: "support",
    },
  },
  {
    name: "F — unusual wording, same underlying idea",
    expected: "high",
    submission: {
      headline: "Polymer fragments recovered from abyssal mud",
      body: "Examination of abyssal sediment yielded man-made polymer pieces, evidencing synthetic contamination of the deep basin floor.",
      stance: "mixed",
    },
  },
];
