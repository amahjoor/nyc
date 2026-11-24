// Public-facing assignments. Posts and shift rotations are fictional and use the
// game's scenery. The same uniform family can serve several different units.
export const UNIFORMS = {
  patrol:    {label:'POLICE', coat:'#304259', cap:'peak'},
  community: {label:'COMMUNITY AFFAIRS', coat:'#416088', cap:'peak'},
  auxiliary: {label:'AUXILIARY', coat:'#415578', cap:'peak', lightBelt:true},
  school:    {label:'SCHOOL SAFETY', coat:'#7188a1', cap:'soft', lightBelt:true},
  traffic:   {label:'TRAFFIC', coat:'#adbd48', cap:'white', reflective:true, lightBelt:true},
  highway:   {label:'HIGHWAY', coat:'#28394d', cap:'motor', reflective:true},
  detective: {label:'DETECTIVE', coat:'#384044', cap:'none', lightBelt:true},
  forensic:  {label:'FORENSICS', coat:'#587789', cap:'soft', lightBelt:true},
  esu:       {label:'POLICE · ESU', coat:'#394756', cap:'helmet', vest:true, carbine:true},
  crc:       {label:'POLICE · CRC', coat:'#283744', cap:'helmet', vest:true, carbine:true},
  rescue:    {label:'EMERGENCY SERVICE', coat:'#b96e38', cap:'rescue', reflective:true},
  canine:    {label:'POLICE K-9', coat:'#304b50', cap:'soft'},
  marine:    {label:'HARBOR', coat:'#c66537', cap:'soft', reflective:true},
  dive:      {label:'SCUBA', coat:'#253f48', cap:'none', lightBelt:true},
  aviation:  {label:'AVIATION', coat:'#465760', cap:'flight', lightBelt:true},
  mounted:   {label:'MOUNTED', coat:'#303d56', cap:'riding'},
  bomb:      {label:'BOMB SQUAD', coat:'#535e4a', cap:'helmet', vest:true},
  transit:   {label:'TRANSIT', coat:'#304259', cap:'peak'},
  housing:   {label:'HOUSING', coat:'#304259', cap:'peak'},
  crossing:  {label:'CROSSING GUARD', coat:'#b6ca49', cap:'soft', reflective:true, lightBelt:true},
  academy:   {label:'POLICE ACADEMY', coat:'#51657a', cap:'soft', lightBelt:true},
  services:  {label:'SUPPORT SERVICES', coat:'#525d67', cap:'soft', lightBelt:true},
};
const root='https://www.nyc.gov/site/nypd/bureaus/';
export const UNIT_SOURCES = {
  patrol:root+'patrol/patrol-landing.page', community:root+'administrative/community-affairs.page',
  crt:root+'patrol/community-response-teams.page', quality:'https://portal.311.nyc.gov/article/?kanumber=KA-03672',
  reform:'https://www.nyc.gov/mayors-office/news/2026/11/mayor-mamdani_and-police-commissionertischdisbandnypd-s-strategi',
  special:root+'patrol/citywide-operations.page', detectives:root+'investigative/detectives.page',
  transit:root+'transit-housing/transit.page', housing:root+'transit-housing/housing.page',
  road:root+'transit-housing/transportation.page', school:root+'administrative/school-safety.page',
  auxiliary:'https://www.nyc.gov/site/nypd/careers/human-resources-info/auxiliary-police.page',
  training:root+'administrative/training.page', services:root+'administrative/support-services.page',
  internal:root+'investigative/internal-affairs.page', strategies:root+'investigative/crime-control-strategies.page',
  ct:root+'investigative/counterterrorism.page', intelligence:root+'investigative/intelligence-counterterrorism.page',
};
// Each assignment has a public name, a fitted wardrobe, a place for its game
// scenes, and an activity. Records with the same job deliberately share motions.
const supportPersonnel = new Set(['auxiliary','crossing','school','traffic-agents','cadets','fleet','clerk','records']);
const groups = [
  ['Patrol and community','patrol',[
    ['patrol','Precinct Patrol','patrol','street','patrol','Walk a beat and respond to calls.'],
    ['community','Community Affairs','community','community','talk','Meet residents and local business owners.','community'],
    ['auxiliary','Auxiliary Police','auxiliary','community','talk','Volunteer to assist the public and report concerns.','auxiliary'],
    ['youth','Youth Strategies Division','community','school','talk','Connect young people with mentoring and enrichment programs.','community'],
    ['outreach','Community Outreach Division','community','community','talk','Help residents find city services and meet local partners.','community'],
    ['housing-community','Housing Community Affairs','community','housing','talk','Meet with residents and community partners.','community'],
    ['quality','Quality of Life Division','patrol','community','patrol','Follow up on neighborhood complaints.','quality'],
    ['crt','Community Response Teams','patrol','precinct','talk','Follow up with neighborhood officers on recurring problems.','crt'],
    ['neighborhood','Neighborhood Safety Teams','patrol','precinct','brief','Work with precinct officers on neighborhood safety.'],
    ['psd','Patrol Support Division','patrol','community','patrol','Provide additional patrol and event support.','reform'],
    ['fast','First Amendment Support Team','community','community','talk','Talk with event organizers and the public.','reform'],
    ['school','School Safety Division','school','school','talk','Help students and visitors at school entrances.','school'],
    ['crossing','School Crossing Guards','crossing','school','direct','Guide pedestrians at school crossings.','road'],
  ]],
  ['Transit and housing','transit',[
    ['transit','Transit District Patrol','transit','subway','patrol','Patrol the subway and help riders.'],
    ['transit-task','Transit Borough Task Forces','transit','subway','brief','Support transit district officers.'],
    ['transit-canine','Transit Canine Unit','canine','subway','dog','Walk through the station area with a working dog.'],
    ['transit-vandals','Citywide Vandals Task Force','detective','subway','patrol','Document vandalism reported in the transit system.'],
    ['transit-projects','Transit Special Projects Unit','transit','subway','brief','Coordinate transit projects with station personnel.'],
    ['transit-fraud','MetroCard Fraud Task Force','detective','subway','interview','Investigate transit fare fraud.'],
    ['transit-security','Transit Anti-Terrorism Unit','transit','subway','patrol','Support transit safety assignments.'],
    ['housing','Housing Bureau Police Service Areas','housing','housing','patrol','Meet residents and patrol public housing developments.','housing'],
  ]],
  ['Transportation','road',[
    ['highway','Highway District','highway','road','motor','Patrol roadways and assist motorists.'],
    ['collision','Collision Investigation Squad','forensic','case','inspect','Document serious traffic collisions.'],
    ['traffic-ops','Traffic Operations District','traffic','junction','direct','Help traffic move through intersections.'],
    ['traffic-agents','Traffic Enforcement District','traffic','parking','parking','Civilian traffic agents check parking and assist road users.'],
    ['traffic-center','Traffic Management Center','highway','precinct','brief','Coordinate traffic information for field personnel.'],
  ]],
  ['Special operations','special',[
    ['esu','Emergency Service Unit','esu','precinct','brief','Provide specialist police and technical rescue assistance.'],
    ['hazmat','ESU Hazmat Team','rescue','precinct','inspect','Support emergency crews at hazardous-materials incidents.'],
    ['k9','ESU Canine Team','canine','park','dog','Work alongside a trained search dog.'],
    ['mounted','Mounted Unit','mounted','park','horse','Patrol on horseback and meet the public.'],
    ['harbor','Harbor Unit','marine','water','boat','Patrol waterways and assist boaters.'],
    ['scuba','SCUBA Team','dive','waterfront','inspect','Prepare for underwater searches and water rescues.'],
    ['aviation','Aviation Unit','aviation','air','flight','Provide air support and assist with rescues.'],
    ['crisis','Crisis Outreach and Support Unit','community','community','talk','Assist people in crisis and coordinate support.'],
  ]],
  ['Intelligence and counterterrorism','ct',[
    ['crc','Critical Response Command','crc','precinct','brief','Provide specialist protective support.'],
    ['bomb','Bomb Squad','bomb','precinct','inspect','Assess reports of suspicious objects.'],
    ['ct-maritime','Counterterrorism Maritime Team','marine','waterfront','brief','Coordinate harbor safety work.'],
    ['shield','NYPD SHIELD Unit','community','community','talk','Share preparedness information with businesses.'],
    ['ct-training','Counterterrorism Training Section','patrol','precinct','brief','Teach preparedness to officers and partner organizations.'],
    ['intelligence','Intelligence Division','detective','precinct','brief','Review information and brief investigators.','intelligence'],
  ]],
  ['Detectives and investigations','detectives',[
    ['detectives','Precinct Detective Squads','detective','precinct','interview','Interview witnesses and follow up on reports.'],
    ['robbery','Central Robbery Division','detective','case','interview','Investigate robbery complaints and related cases.'],
    ['major','Major Case Squad','detective','case','interview','Investigate major cases, including bank robberies.'],
    ['scene','Crime Scene Unit','forensic','case','inspect','Document a scene and collect evidence.'],
    ['forensics','Forensic Investigations Division','forensic','office','inspect','Examine and document physical evidence.'],
    ['homicide','Homicide Squads','detective','case','interview','Investigate deaths with precinct detectives.'],
    ['missing','Missing Persons Squad','detective','community','interview','Gather information to help locate missing people.'],
    ['negotiation','Hostage Negotiation Team','detective','precinct','talk','Use communication to resolve crises.'],
    ['special-victims','Special Victims Division','detective','precinct','interview','Coordinate investigations and support for survivors.'],
    ['domestic','Domestic Violence Unit','detective','precinct','interview','Follow up on incidents and connect survivors with support.'],
    ['hate-crime','Hate Crime Task Force','detective','precinct','interview','Investigate reports of bias-motivated crime.'],
    ['cold','Cold Case Squad','detective','precinct','brief','Review unresolved investigations.'],
    ['auto','Auto Crime Division','detective','case','patrol','Examine reports involving stolen vehicles.'],
    ['arson','Arson and Explosion Squad','forensic','precinct','inspect','Work with fire investigators on incident evidence.'],
    ['computer','Computer Crimes Squad','forensic','precinct','inspect','Examine digital evidence for investigators.'],
    ['animals','Animal Cruelty Investigation Squad','detective','community','interview','Investigate reports of animal neglect or abuse.'],
    ['larceny','Grand Larceny Division','detective','precinct','interview','Investigate financial and property crimes.'],
    ['gang','Gang Squads','detective','precinct','brief','Investigate organized patterns of violence.'],
    ['narcotics','Narcotics Boroughs','detective','precinct','brief','Investigate drug distribution cases.'],
    ['overdose','Overdose Squads','detective','precinct','interview','Investigate reported overdoses.'],
    ['vice','Vice Enforcement Division','detective','precinct','interview','Investigate exploitation and trafficking.'],
    ['enterprise','Criminal Enterprise Investigative Section','detective','precinct','brief','Build long-term organized crime cases.'],
    ['fugitive','Fugitive Enforcement Division','detective','precinct','brief','Coordinate follow-up for outstanding warrants.'],
    ['gun-violence','Gun Violence Suppression Division','detective','precinct','brief','Investigate illegal firearms trafficking.'],
    ['da','District Attorneys Squad','detective','precinct','brief','Coordinate cases with borough prosecutors.'],
  ]],
  ['Training and support','training',[
    ['recruits','Recruit Training Section','academy','office','brief','Teach new recruits at the Police Academy.'],
    ['specialized-training','Specialized Training Section','academy','office','brief','Teach continuing courses for department members.'],
    ['leadership','Leadership Training Section','academy','office','brief','Teach supervisors and department leaders.'],
    ['school-training','School Safety Training Unit','school','office','brief','Train school safety personnel.'],
    ['traffic-training','Traffic Enforcement Training Unit','traffic','office','brief','Train traffic enforcement personnel.'],
    ['firearms-training','Firearms and Tactics Section','academy','office','brief','Provide specialist instruction at the academy.'],
    ['cadets','Police Cadet Corps','academy','community','talk','Learn about public service and assist department staff.'],
    ['internal','Internal Affairs Bureau','detective','office','interview','Receive complaints and investigate misconduct.','internal'],
    ['compstat','Office of Crime Control Strategies','detective','office','brief','Review citywide crime trends and prepare briefings.','strategies'],
    ['fleet','Fleet Services Division','services','precinct','inspect','Inspect and maintain department vehicles.','services'],
    ['clerk','Property Clerk Division','services','office','inspect','Receive and keep records of property in department custody.','services'],
    ['records','Central Records Division','services','office','brief','Maintain records and assist with public inquiries.','services'],
  ]],
];
export const POLICE_UNITS = groups.flatMap(([bureau,source,rows]) => rows.map(
  ([id,name,uniform,post,activity,duty,reference=source]) => ({id,name,bureau,uniform,post,activity,duty,sworn:!supportPersonnel.has(id),source:UNIT_SOURCES[reference]})
));
export const UNIT = Object.fromEntries(POLICE_UNITS.map(unit=>[unit.id,unit]));
export function unitHash(value) {
  let hash=0;
  for(const ch of String(value ?? '')) hash=(Math.imul(hash,31)+ch.charCodeAt(0))>>>0;
  return hash;
}
