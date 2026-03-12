'use client'

import CharacterGalleryCard from '@/components/ui-elements/character-gallery-card'
import FilterTab from '@/components/ui-elements/filter-tab'
import PaginationControls from '@/components/ui-elements/pagination-controls'
import SearchField from '@/components/ui-elements/search-field'
import { useMemo, useState } from 'react'

type CharacterCategory = 'official' | 'community' | 'your-characters'

type CharacterRecord = {
  id: string
  name: string
  likes: string
  chats: string
  description?: string
  gradientClassName: string
  category: CharacterCategory
}

const categoryTabs: Array<{ key: CharacterCategory; label: string }> = [
  { key: 'official', label: 'Official' },
  { key: 'community', label: 'Community' },
  { key: 'your-characters', label: 'Your Characters' }
]

const characterVariants: Omit<CharacterRecord, 'id' | 'category'>[] = [
  {
    name: 'Airi Akizuki',
    likes: '1.2k',
    chats: '2.4k',
    gradientClassName: 'from-[#322a39] via-[#19263a] to-[#0b1018]'
  },
  {
    name: 'Airi Akizuki',
    likes: '1.2k',
    chats: '2.4k',
    description: 'Your fantasy from this world into reality. Personal interactions and immersive scenes.',
    gradientClassName: 'from-[#3f343a] via-[#2a2e37] to-[#121722]'
  },
  {
    name: 'Airi Akizuki',
    likes: '1.2k',
    chats: '2.4k',
    gradientClassName: 'from-[#29252f] via-[#1d1e2f] to-[#11111b]'
  },
  {
    name: 'Airi Akizuki',
    likes: '1.2k',
    chats: '2.4k',
    gradientClassName: 'from-[#332936] via-[#2a2030] to-[#150f18]'
  }
]

const allCharacters: CharacterRecord[] = Array.from({ length: 72 }, (_, index) => {
  const variant = characterVariants[index % characterVariants.length]
  const category: CharacterCategory = index % 3 === 0 ? 'official' : index % 3 === 1 ? 'community' : 'your-characters'

  return {
    id: `character-${index + 1}`,
    name: variant.name,
    likes: variant.likes,
    chats: variant.chats,
    description: variant.description,
    gradientClassName: variant.gradientClassName,
    category
  }
})

const CharactersPage = () => {
  const [activeCategory, setActiveCategory] = useState<CharacterCategory>('official')
  const [searchValue, setSearchValue] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  const handleCategoryChange = (nextCategory: CharacterCategory) => {
    setActiveCategory(nextCategory)
    setCurrentPage(1)
  }

  const handleSearchChange = (nextSearchValue: string) => {
    setSearchValue(nextSearchValue)
    setCurrentPage(1)
  }

  const filteredCharacters = useMemo(() => {
    const normalizedSearchValue = searchValue.trim().toLowerCase()

    return allCharacters.filter((characterItem) => {
      if (characterItem.category !== activeCategory) {
        return false
      }

      if (normalizedSearchValue.length === 0) {
        return true
      }

      return characterItem.name.toLowerCase().includes(normalizedSearchValue)
    })
  }, [activeCategory, searchValue])

  const itemsPerPage = 12
  const totalPages = Math.max(1, Math.ceil(filteredCharacters.length / itemsPerPage))
  const visiblePage = Math.min(currentPage, totalPages)

  const paginatedCharacters = useMemo(() => {
    const offset = (visiblePage - 1) * itemsPerPage
    return filteredCharacters.slice(offset, offset + itemsPerPage)
  }, [filteredCharacters, visiblePage])

  return (
    <main className="relative overflow-hidden bg-[#030303] text-white">
      <section className="relative min-h-[calc(100vh-140px)] border-b border-white/10 px-5 py-10 md:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_40%_0%,rgba(244,99,19,0.15),transparent_32%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.09)_1px,transparent_1px)] [background-size:22px_22px] opacity-50" />

        <div className="relative z-10 mx-auto w-full max-w-[1150px]">
          <h1 className="text-center font-[family-name:var(--font-heading)] text-5xl font-semibold italic text-white md:text-6xl">
            AI Anime Girlfriend
          </h1>

          <div className="mt-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4 border-b border-white/15 pb-2">
              {categoryTabs.map((tabItem) => (
                <FilterTab
                  key={tabItem.key}
                  label={tabItem.label}
                  isActive={activeCategory === tabItem.key}
                  onClick={() => handleCategoryChange(tabItem.key)}
                  ariaLabel={`Filter by ${tabItem.label}`}
                />
              ))}
            </div>

            <div className="w-full md:max-w-[430px]">
              <SearchField
                value={searchValue}
                onChange={handleSearchChange}
                placeholder="Search..."
                ariaLabel="Search characters"
              />
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {paginatedCharacters.map((characterItem) => (
              <CharacterGalleryCard
                key={characterItem.id}
                id={characterItem.id}
                name={characterItem.name}
                likes={characterItem.likes}
                chats={characterItem.chats}
                gradientClassName={characterItem.gradientClassName}
                description={characterItem.description}
              />
            ))}
          </div>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 text-center md:flex-row md:gap-6">
            <p className="text-xs text-white/75">{filteredCharacters.length} VRM characters</p>
            <PaginationControls currentPage={visiblePage} totalPages={totalPages} onPageChange={setCurrentPage} />
          </div>
        </div>
      </section>
    </main>
  )
}

export default CharactersPage
