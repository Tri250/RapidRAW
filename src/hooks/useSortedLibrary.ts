import { useMemo } from 'react';
import { useLibraryStore } from '../store/useLibraryStore';
import { useSettingsStore } from '../store/useSettingsStore';
import {
  RawStatus,
  EditedStatus,
  SortDirection,
  ImageFile,
  GroupPreference,
  GroupingMode,
} from '../components/ui/AppProperties';
import { buildImageGroups, GroupBadgeInfo, GroupingResult, GroupId } from '../utils/imageGrouping';

// The \b after the field alternation is essential: without it a plain tag like
// "sunset" or "sky" would be captured as the single-letter field "s" (shutter)
// with value "unset"/"ky" and silently evaluated as a broken numeric query that
// matches every image. The word boundary keeps fields attached to their value.
export const ADVANCED_QUERY_REGEX =
  /^(iso|aperture|f|shutter|s|focal|mm|rating|color|camera|make|model|lens)\b\s*(?::)?\s*(>=|<=|>|<|=)?\s*(.+)$/i;

export const parseShutter = (val: string | undefined): number => {
  if (!val) return 0;
  const cleanVal = val.replace(/s/i, '').trim();
  const parts = cleanVal.split('/');
  if (parts.length === 2) {
    const num = parseFloat(parts[0]);
    const den = parseFloat(parts[1]);
    return den !== 0 ? num / den : 0;
  }
  const numVal = parseFloat(cleanVal);
  return isNaN(numVal) ? 0 : numVal;
};

/**
 * Returns true only when the string is a usable shutter-speed query value
 * (a fraction like "1/200", a decimal like "0.5", or a plain number).
 * parseShutter returns 0 for garbage input, so this is used to reject
 * malformed advanced queries instead of letting "s:abc" match every image
 * that has no exposure data (0 === 0).
 */
export const isValidShutterValue = (val: string | undefined): boolean => {
  if (!val) return false;
  const cleanVal = val.replace(/s$/i, '').trim();
  if (!cleanVal) return false;
  if (cleanVal.includes('/')) {
    const [num, den] = cleanVal.split('/');
    const numN = parseFloat(num);
    const denN = parseFloat(den);
    return Number.isFinite(numN) && Number.isFinite(denN) && denN !== 0;
  }
  return Number.isFinite(parseFloat(cleanVal));
};

export const parseAperture = (val: string | undefined): number => {
  if (!val) return 0;
  const match = val.match(/(\d+(\.\d+)?)/);
  const numVal = match ? parseFloat(match[0]) : 0;
  return isNaN(numVal) ? 0 : numVal;
};

export const parseFocalLength = (val: string | undefined): number => {
  if (!val) return 0;
  const match = val.match(/(\d+(\.\d+)?)/);
  if (!match) return 0;
  const numVal = parseFloat(match[0]);
  return isNaN(numVal) ? 0 : numVal;
};

export interface GroupedLibrary {
  displayList: ImageFile[];
  badges: Map<GroupId, GroupBadgeInfo> | null;
}

export function computeGroupedLibrary(libraryState: any, settingsState: any): GroupedLibrary {
  const { imageList, imageRatings, filterCriteria, searchCriteria, sortCriteria } = libraryState;
  const { appSettings, supportedTypes } = settingsState;

  const groupingMode: GroupingMode = appSettings?.grouping ?? 'off';
  const isGroupingActive = groupingMode !== 'off';

  const getParentDir = (filePath: string): string => {
    const separator = filePath.includes('/') ? '/' : '\\';
    const lastSeparatorIndex = filePath.lastIndexOf(separator);
    if (lastSeparatorIndex === -1) return '';
    return filePath.substring(0, lastSeparatorIndex);
  };

  const matchesFilter = (image: ImageFile): boolean => {
    if (filterCriteria.rating !== 0) {
      const rating = imageRatings[image.path] || 0;
      if (filterCriteria.rating === -1 && rating !== 0) return false;
      if (filterCriteria.rating === 5 && rating !== 5) return false;
      if (filterCriteria.rating > 0 && filterCriteria.rating < 5 && rating < filterCriteria.rating) return false;
    }

    if (filterCriteria.rawStatus && filterCriteria.rawStatus !== RawStatus.All) {
      if (filterCriteria.rawStatus === RawStatus.RawOverNonRaw && supportedTypes) {
        // handled separately below
      } else {
        const pathWithoutVC = image.path.split('?vc=')[0];
        const extension = pathWithoutVC.split('.').pop()?.toLowerCase() || '';
        const isRaw = supportedTypes?.raw?.includes(extension) || image.is_raw;

        if (filterCriteria.rawStatus === RawStatus.RawOnly && !isRaw) return false;
        if (filterCriteria.rawStatus === RawStatus.NonRawOnly && isRaw) return false;
      }
    }

    if (filterCriteria.editedStatus && filterCriteria.editedStatus !== EditedStatus.All) {
      if (filterCriteria.editedStatus === EditedStatus.EditedOnly && !image.is_edited) return false;
      if (filterCriteria.editedStatus === EditedStatus.UneditedOnly && image.is_edited) return false;
    }

    if (filterCriteria.colors && filterCriteria.colors.length > 0) {
      const imageColor = (image.tags || []).find((tag: string) => tag.startsWith('color:'))?.substring(6);
      const hasMatchingColor = imageColor && filterCriteria.colors.includes(imageColor);
      const matchesNone = !imageColor && filterCriteria.colors.includes('none');

      if (!hasMatchingColor && !matchesNone) return false;
    }

    return true;
  };

  // RawOverNonRaw filtering
  let processedList = imageList;
  if (filterCriteria.rawStatus === RawStatus.RawOverNonRaw && supportedTypes) {
    const rawBaseNames = new Set<string>();

    for (const image of imageList) {
      const pathWithoutVC = image.path.split('?vc=')[0];
      const filename = pathWithoutVC.split(/[\\/]/).pop() || '';
      const lastDotIndex = filename.lastIndexOf('.');
      const extension = lastDotIndex !== -1 ? filename.substring(lastDotIndex + 1).toLowerCase() : '';

      if (extension && supportedTypes.raw.includes(extension)) {
        const baseName = lastDotIndex !== -1 ? filename.substring(0, lastDotIndex) : filename;
        const parentDir = getParentDir(pathWithoutVC);
        const uniqueKey = `${parentDir}/${baseName}`;
        rawBaseNames.add(uniqueKey);
      }
    }

    if (rawBaseNames.size > 0) {
      processedList = imageList.filter((image: ImageFile) => {
        const pathWithoutVC = image.path.split('?vc=')[0];
        const filename = pathWithoutVC.split(/[\\/]/).pop() || '';
        const lastDotIndex = filename.lastIndexOf('.');
        const extension = lastDotIndex !== -1 ? filename.substring(lastDotIndex + 1).toLowerCase() : '';

        const isNonRaw = extension && supportedTypes.nonRaw.includes(extension);

        if (isNonRaw) {
          const baseName = lastDotIndex !== -1 ? filename.substring(0, lastDotIndex) : filename;
          const parentDir = getParentDir(pathWithoutVC);
          const uniqueKey = `${parentDir}/${baseName}`;

          if (rawBaseNames.has(uniqueKey)) {
            return false;
          }
        }
        return true;
      });
    }
  }

  // Apply grouping
  let searchMatchingGroupIds: Set<string> | null = null;
  const { tags: searchTags, text: searchText, mode: searchMode } = searchCriteria;
  const lowerCaseSearchText = searchText.trim().toLowerCase();

  const parsedTags = searchTags.map((tag: string) => {
    const match = tag.match(ADVANCED_QUERY_REGEX);
    if (match) {
      const operator = match[2] || '=';
      return { type: 'query', field: match[1].toLowerCase(), operator, value: match[3].toLowerCase(), raw: tag };
    }
    return { type: 'normal', value: tag.toLowerCase(), raw: tag };
  });

  const evaluateQuery = (q: any, image: ImageFile) => {
    const { field, operator, value } = q;

    if (['iso', 'aperture', 'f', 'shutter', 's', 'focal', 'mm', 'rating'].includes(field)) {
      let imgVal = 0;
      let qVal = parseFloat(value);

      if (field === 'iso')
        imgVal = parseInt(image.exif?.PhotographicSensitivity || image.exif?.ISOSpeedRatings || '0', 10) || 0;
      else if (field === 'aperture' || field === 'f') imgVal = parseAperture(image.exif?.FNumber);
      else if (field === 'focal' || field === 'mm') imgVal = parseFocalLength(image.exif?.FocalLength);
      else if (field === 'rating') imgVal = imageRatings[image.path] || 0;
      else if (field === 'shutter' || field === 's') {
        imgVal = parseShutter(image.exif?.ExposureTime);
        qVal = parseShutter(value);
      }

      // Reject malformed query values so they cannot silently match every
      // image: parseFloat(garbage) is NaN, and parseShutter(garbage) is 0,
      // which would otherwise compare equal to the 0 of images without exif.
      const isShutterField = field === 'shutter' || field === 's';
      if (isShutterField ? !isValidShutterValue(value) : !Number.isFinite(qVal)) {
        return false;
      }

      switch (operator) {
        case '>':
          return imgVal > qVal;
        case '<':
          return imgVal < qVal;
        case '>=':
          return imgVal >= qVal;
        case '<=':
          return imgVal <= qVal;
        case '=':
        case ':':
          return imgVal === qVal;
        default:
          return false;
      }
    } else {
      let imgStr = '';
      if (field === 'camera' || field === 'make' || field === 'model') {
        imgStr = `${image.exif?.Make || ''} ${image.exif?.Model || ''}`.toLowerCase();
      } else if (field === 'lens') {
        imgStr = String(
          `${image.exif?.LensModel || ''} ${image.exif?.Lens || ''} ${image.exif?.LensMake || ''}`,
        ).toLowerCase();
      } else if (field === 'color') {
        imgStr = (image.tags || []).find((t: string) => t.startsWith('color:'))?.substring(6) || '';
      }

      return operator === '=' || operator === ':' ? imgStr.includes(value) : false;
    }
  };

  const isSearchActive = parsedTags.length > 0 || lowerCaseSearchText !== '';

  const matchesSearch = (image: ImageFile): boolean => {
    if (!isSearchActive) return true;

    const lowerCaseImageTags = (image.tags || []).map((t) => t.toLowerCase().replace('user:', ''));
    const filename = image?.path?.split(/[\\/]/)?.pop()?.toLowerCase() || '';

    let tagsMatch = true;
    if (parsedTags.length > 0) {
      const evaluateTag = (parsedTag: any) => {
        if (parsedTag.type === 'normal') {
          return lowerCaseImageTags.some((imgTag) => imgTag.includes(parsedTag.value));
        }
        return evaluateQuery(parsedTag, image);
      };

      if (searchMode === 'OR') {
        tagsMatch = parsedTags.some((pt: any) => evaluateTag(pt));
      } else {
        tagsMatch = parsedTags.every((pt: any) => evaluateTag(pt));
      }
    }

    let textMatch = true;
    if (lowerCaseSearchText !== '') {
      textMatch =
        filename.includes(lowerCaseSearchText) || lowerCaseImageTags.some((t) => t.includes(lowerCaseSearchText));
    }

    return tagsMatch && textMatch;
  };

  // Apply grouping if active
  if (isGroupingActive) {
    const groupEditedFiles = appSettings?.groupEditedFiles ?? true;
    const groupingResult = buildImageGroups(processedList, groupingMode as GroupPreference, groupEditedFiles);
    processedList = groupingResult.displayList;

    if (isSearchActive) {
      searchMatchingGroupIds = new Set<string>();
      for (const image of imageList) {
        if (!image.group_id) continue;
        if (matchesSearch(image)) {
          searchMatchingGroupIds.add(image.group_id);
        }
      }
    }
  }

  const filteredList = processedList.filter((image: ImageFile) => matchesFilter(image));

  const filteredBySearch = !isSearchActive
    ? filteredList
    : filteredList.filter((image: ImageFile) => {
        if (searchMatchingGroupIds && image.group_id && searchMatchingGroupIds.has(image.group_id)) return true;
        return matchesSearch(image);
      });

  const list = [...filteredBySearch];

  list.sort((a, b) => {
    const { key, order } = sortCriteria;
    let comparison = 0;

    switch (key) {
      case 'date_taken': {
        const dateA = a.exif?.DateTimeOriginal || '';
        const dateB = b.exif?.DateTimeOriginal || '';
        if (dateA !== dateB) comparison = dateA < dateB ? -1 : 1;
        else comparison = a.modified - b.modified;
        break;
      }
      case 'iso': {
        const isoA = parseInt(a.exif?.PhotographicSensitivity || a.exif?.ISOSpeedRatings || '0', 10) || 0;
        const isoB = parseInt(b.exif?.PhotographicSensitivity || b.exif?.ISOSpeedRatings || '0', 10) || 0;
        comparison = isoA - isoB;
        break;
      }
      case 'shutter_speed': {
        comparison = parseShutter(a.exif?.ExposureTime) - parseShutter(b.exif?.ExposureTime);
        break;
      }
      case 'aperture': {
        comparison = parseAperture(a.exif?.FNumber) - parseAperture(b.exif?.FNumber);
        break;
      }
      case 'focal_length': {
        comparison = parseFocalLength(a.exif?.FocalLength) - parseFocalLength(b.exif?.FocalLength);
        break;
      }
      case 'date':
        comparison = a.modified - b.modified;
        break;
      case 'rating':
        comparison = (imageRatings[a.path] || 0) - (imageRatings[b.path] || 0);
        break;
      case 'edited':
        comparison = a.is_edited === b.is_edited ? 0 : a.is_edited ? 1 : -1;
        break;
      default: {
        const nameA = a.path.split(/[\\/]/).pop() || a.path;
        const nameB = b.path.split(/[\\/]/).pop() || b.path;
        comparison = nameA.localeCompare(nameB);
        break;
      }
    }

    if (comparison === 0 && key !== 'name') {
      const nameA = a.path.split(/[\\/]/).pop() || a.path;
      const nameB = b.path.split(/[\\/]/).pop() || b.path;
      return nameA.localeCompare(nameB);
    }

    return order === SortDirection.Ascending ? comparison : -comparison;
  });

  // Also apply legacy group_id-based grouping if present
  const hasGroupIds = list.some((img) => img.group_id);
  if (hasGroupIds && !isGroupingActive) {
    const preference: GroupPreference =
      filterCriteria.rawStatus === RawStatus.RawOnly
        ? 'raw'
        : filterCriteria.rawStatus === RawStatus.NonRawOnly
          ? 'jpeg'
          : 'first';
    const { displayList } = buildImageGroups(list, preference);
    return { displayList, badges: null };
  }

  const badges = isGroupingActive
    ? buildImageGroups(imageList, groupingMode as GroupPreference, appSettings?.groupEditedFiles ?? true).badges
    : null;

  return { displayList: list, badges };
}

export function computeSortedLibrary(libraryState: any, settingsState: any): ImageFile[] {
  return computeGroupedLibrary(libraryState, settingsState).displayList;
}

export function useSortedLibrary() {
  const imageList = useLibraryStore((state) => state.imageList);
  const imageRatings = useLibraryStore((state) => state.imageRatings);
  const filterCriteria = useLibraryStore((state) => state.filterCriteria);
  const searchCriteria = useLibraryStore((state) => state.searchCriteria);
  const sortCriteria = useLibraryStore((state) => state.sortCriteria);

  const appSettings = useSettingsStore((state) => state.appSettings);
  const supportedTypes = useSettingsStore((state) => state.supportedTypes);

  const result = useMemo(() => {
    return computeGroupedLibrary(
      { imageList, imageRatings, filterCriteria, searchCriteria, sortCriteria },
      { appSettings, supportedTypes },
    );
  }, [imageList, sortCriteria, imageRatings, filterCriteria, searchCriteria, appSettings, supportedTypes]);

  return result;
}
