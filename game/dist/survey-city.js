/** Share the measured building ground surfaces between collision and minimap. */
export function applySurvey(city, survey) {
  if (!survey?.buildings?.length) throw new Error('NYC survey geometry is missing.');
  if (city.origin.lat !== survey.origin.lat || city.origin.lon !== survey.origin.lon) {
    throw new Error('NYC survey and street map must use the same geographic origin.');
  }
  const buildings = survey.buildings.filter(building => building.inPlayableArea).flatMap(building =>
    building.footprints.map((footprint, index) => ({
      id: `${building.id}:${index}`,
      surveyId: building.id,
      bin: building.bin,
      polygon: footprint.outer,
      holes: footprint.holes || [],
      height: building.height,
      baseElevation: building.baseElevation,
      heightEstimated: false,
      heightSource: 'nyc-oti-2014-survey',
      kind: 'survey',
    })),
  );
  if (!buildings.length) throw new Error('NYC survey has no playable ground surfaces.');
  return { ...city, buildings, surveySource: survey.source };
}
