export type CandidateProfile = {
  id: string
  firstName: string
  lastName: string
  globalId: string
  country: string
  gender?: string
  legalEntity: string
  organizationalUnit: string
  careerPath: string
  functionalArea: string
  developmentPool: string
  promotionCandidate: boolean
}

export type CandidateNote = {
  id: string
  candidateId: string
  title: string
  description: string
  createdBy: string
  createdOn: string
}

export type CandidateFilters = {
  country: string[]
  legalEntity: string[]
  organizationalUnit: string[]
  careerPath: string[]
  functionalArea: string[]
  developmentPool: string[]
  onlyPromotionCandidates: boolean
  searchText: string
}

export const emptyFilters: CandidateFilters = {
  country: [],
  legalEntity: [],
  organizationalUnit: [],
  careerPath: [],
  functionalArea: [],
  developmentPool: [],
  onlyPromotionCandidates: false,
  searchText: "",
}
