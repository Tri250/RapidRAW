import { ExportPreset } from './ExportImportProperties';
import { Adjustments, CopyPasteSettings } from '../../utils/adjustments';
import { ToolType } from '../panel/right/Masks';

export const GLOBAL_KEYS = [
  ' ',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'f',
  'b',
  'a',
  's',
  'd',
  'r',
  'm',
  'k',
  'p',
  'i',
  'e',
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  'Enter',
];
export const OPTION_SEPARATOR = 'separator';

export enum Invokes {
  AddTagForPaths = 'add_tag_for_paths',
  ApplyAdjustments = 'apply_adjustments',
  ApplySuperResolution = 'apply_super_resolution',
  ApplyAdjustmentsToPaths = 'apply_adjustments_to_paths',
  ApplyAutoAdjustmentsToPaths = 'apply_auto_adjustments_to_paths',
  ApplyDenoising = 'apply_denoising',
  CalculateAutoAdjustments = 'calculate_auto_adjustments',
  CancelExport = 'cancel_export',
  CheckAIConnectorStatus = 'check_ai_connector_status',
  ClearAllSidecars = 'clear_all_sidecars',
  ClearAiTags = 'clear_ai_tags',
  ClearAllTags = 'clear_all_tags',
  ClearThumbnailCache = 'clear_thumbnail_cache',
  CopyFiles = 'copy_files',
  CreateFolder = 'create_folder',
  CreateVirtualCopy = 'create_virtual_copy',
  CullImages = 'cull_images',
  DeleteFolder = 'delete_folder',
  DuplicateFile = 'duplicate_file',
  EstimateExportSizes = 'estimate_export_sizes',
  ExportImages = 'export_images',
  FrontendLog = 'frontend_log',
  GenerateAiDepthMask = 'generate_ai_depth_mask',
  GenerateAiForegroundMask = 'generate_ai_foreground_mask',
  GenerateAiSkyMask = 'generate_ai_sky_mask',
  GenerateAiSubjectMask = 'generate_ai_subject_mask',
  GenerateManualCleanupPatch = 'generate_manual_cleanup_patch',
  PrecomputeAiSubjectMask = 'precompute_ai_subject_mask',
  GenerateAiRating = 'generate_ai_rating',
  GenerateAiRatingsBatch = 'generate_ai_ratings_batch',
  GeneratePreviewForPath = 'generate_preview_for_path',
  GenerateMaskOverlay = 'generate_mask_overlay',
  GeneratePresetPreview = 'generate_preset_preview',
  GenerateThumbnailsProgressive = 'update_thumbnail_queue',
  GenerateUncroppedPreview = 'generate_uncropped_preview',
  GenerateOriginalTransformedPreview = 'generate_original_transformed_preview',
  GetFolderTree = 'get_folder_tree',
  GetFolderChildren = 'get_folder_children',
  GetPinnedFolderTrees = 'get_pinned_folder_trees',
  GetLogFilePath = 'get_log_file_path',
  GetOrCreateInternalLibraryRoot = 'get_or_create_internal_library_root',
  GetSupportedFileTypes = 'get_supported_file_types',
  HandleExportPresetsToFile = 'handle_export_presets_to_file',
  HandleImportPresetsFromFile = 'handle_import_presets_from_file',
  HandleImportLegacyPresetsFromFile = 'handle_import_legacy_presets_from_file',
  ImportFiles = 'import_files',
  InvokeGenerativeReplaceWithMaskDef = 'invoke_generative_replace_with_mask_def',
  ListImagesInDir = 'list_images_in_dir',
  ListImagesRecursive = 'list_images_recursive',
  LoadImage = 'load_image',
  IsImageCached = 'is_image_cached',
  LoadMetadata = 'load_metadata',
  LoadPresets = 'load_presets',
  LoadSettings = 'load_settings',
  MoveFiles = 'move_files',
  ReadExifForPaths = 'read_exif_for_paths',
  RemoveTagForPaths = 'remove_tag_for_paths',
  RenameFiles = 'rename_files',
  RenameFolder = 'rename_folder',
  ResetAdjustmentsForPaths = 'reset_adjustments_for_paths',
  SaveMetadataAndUpdateThumbnail = 'save_metadata_and_update_thumbnail',
  SaveCollage = 'save_collage',
  SaveDenoisedImage = 'save_denoised_image',
  SavePanorama = 'save_panorama',
  SaveHdr = 'save_hdr',
  SavePresets = 'save_presets',
  SaveSettings = 'save_settings',
  SetColorLabelForPaths = 'set_color_label_for_paths',
  SetRatingForPaths = 'set_rating_for_paths',
  ShowInFinder = 'show_in_finder',
  DeleteFilesFromDisk = 'delete_files_from_disk',
  DeleteFilesWithAssociated = 'delete_files_with_associated',
  StartBackgroundIndexing = 'start_background_indexing',
  StitchPanorama = 'stitch_panorama',
  MergeHdr = 'merge_hdr',
  TestAIConnectorConnection = 'test_ai_connector_connection',
  UpdateWgpuTransform = 'update_wgpu_transform',
  UpdateExifFields = 'update_exif_fields',
  FetchCommunityPresets = 'fetch_community_presets',
  GenerateAllCommunityPreviews = 'generate_all_community_previews',
  SaveCommunityPreset = 'save_community_preset',
  SaveTempFile = 'save_temp_file',
  BatchDenoiseImages = 'batch_denoise_images',
  PreviewNegativeConversion = 'preview_negative_conversion',
  ConvertNegatives = 'convert_negatives',
  GetAlbums = 'get_albums',
  SaveAlbums = 'save_albums',
  AddToAlbum = 'add_to_album',
  GetAlbumImages = 'get_album_images',
  // LUT processing
  LoadAndParseLut = 'load_and_parse_lut',
  ListLuts = 'list_luts',
  ImportLuts = 'import_luts',
  RemoveLut = 'remove_lut',
  GenerateLutPreviews = 'generate_lut_previews',
  // Cache management
  ClearSessionCaches = 'clear_session_caches',
  ClearImageCaches = 'clear_image_caches',
  // System
  FrontendReady = 'frontend_ready',
  CancelThumbnailGeneration = 'cancel_thumbnail_generation',
  GetImageDimensions = 'get_image_dimensions',
  PreviewGeometryTransform = 'preview_geometry_transform',
  SetAiModelMirror = 'set_ai_model_mirror',
  // Android
  ResolveAndroidContentUriName = 'resolve_android_content_uri_name',
  SaveToAndroidGallery = 'save_to_android_gallery',
  ShareImage = 'share_image',
  // Mask generation
  GenerateColorRangeMask = 'generate_color_range_mask',
  GenerateLuminanceRangeMask = 'generate_luminance_range_mask',
  ApplyMaskFeather = 'apply_mask_feather',
  // AI commands
  GenerateAiSkyReplace = 'generate_ai_sky_replace',
  GenerateAiBackgroundRemove = 'generate_ai_background_remove',
  // Image processing
  DetectHorizonLines = 'detect_horizon_lines',
  AutoStraightenHorizon = 'auto_straighten_horizon',
  // Lens correction
  AutodetectLens = 'autodetect_lens',
  GetLensfunMakers = 'get_lensfun_makers',
  GetLensfunLensesForMaker = 'get_lensfun_lenses_for_maker',
  GetLensDistortionParams = 'get_lens_distortion_params',
  // ── P0: GPU compute pipeline ──
  GpuApplyAdjustments = 'gpu_apply_adjustments',
  // ── P1: Color science (ACES) ──
  ColorConvertSpace = 'color_convert_space',
  ColorApplyAcesOutput = 'color_apply_aces_output',
  ColorSrgbToLinear = 'color_srgb_to_linear',
  ColorLinearToSrgb = 'color_linear_to_srgb',
  ColorApplyAcesFitted = 'color_apply_aces_fitted',
  // ── P2: LUT processor ──
  LutParseCubeFile = 'lut_parse_cube_file',
  LutApplyToImage = 'lut_apply_to_image',
  // ── P1: Project management ──
  ProjectOpen = 'project_open',
  ProjectClose = 'project_close',
  ProjectCreateEditVersion = 'project_create_edit_version',
  ProjectListVersions = 'project_list_versions',
  ProjectGetCurrentVersion = 'project_get_current_version',
  ProjectSetCurrentVersion = 'project_set_current_version',
  ProjectStoreThumbnail = 'project_store_thumbnail',
  ProjectGetThumbnail = 'project_get_thumbnail',
  ProjectAddAiLabel = 'project_add_ai_label',
  ProjectGetLabels = 'project_get_labels',
  ProjectSearchLabels = 'project_search_labels',
  // ── P2: AI labeling ──
  AiLabelingAutoLabel = 'ai_labeling_auto_label',
  AiLabelingSearchByText = 'ai_labeling_search_by_text',
  AiLabelingFindSimilar = 'ai_labeling_find_similar',
  AiLabelingGetStats = 'ai_labeling_get_stats',
}

export enum ExifOverlay {
  Off = 'off',
  Hover = 'hover',
  Always = 'always',
}

export enum Panel {
  Adjustments = 'adjustments',
  Ai = 'ai',
  Color = 'color',
  Crop = 'crop',
  Export = 'export',
  Masks = 'masks',
  Metadata = 'metadata',
  Portrait = 'portrait',
  Presets = 'presets',
}

export enum RawStatus {
  All = 'all',
  NonRawOnly = 'nonRawOnly',
  RawOnly = 'rawOnly',
  RawOverNonRaw = 'rawOverNonRaw',
}

export enum SortDirection {
  Ascending = 'asc',
  Descending = 'desc',
}

export type FolderSortKey = 'name' | 'modified' | 'created' | 'imageCount';

export interface FolderTreeSort {
  key: FolderSortKey;
  order: SortDirection;
}

export enum Theme {
  Arctic = 'arctic',
  Blue = 'blue',
  Dark = 'dark',
  Grey = 'grey',
  Light = 'light',
  MutedGreen = 'muted-green',
  Sepia = 'sepia',
  Snow = 'snow',
}

export enum ThumbnailAspectRatio {
  Cover = 'cover',
  Contain = 'contain',
}

export interface AppSettings {
  aiConnectorAddress?: string;
  aiProvider?: string;
  decorations?: any;
  editorPreviewResolution?: number;
  enableZoomHifi?: boolean;
  useFullDpiRendering?: boolean;
  highResZoomMultiplier?: number;
  enableLivePreviews?: boolean;
  livePreviewQuality?: string;
  enableAiTagging?: boolean;
  filterCriteria?: FilterCriteria;
  lastFolderState?: any;
  pinnedFolders?: any;
  rootFolders?: string[];
  taggingShortcuts?: string[];
  lastRootPath: string | null;
  libraryViewMode?: LibraryViewMode;
  sortCriteria?: SortCriteria;
  theme: Theme;
  thumbnailSize?: ThumbnailSize;
  thumbnailAspectRatio?: ThumbnailAspectRatio;
  uiVisibility?: UiVisibility;
  adjustmentVisibility?: { [key: string]: boolean };
  rawHighlightCompression?: number;
  processingBackend?: string;
  linuxGpuOptimization?: boolean;
  exportPresets?: ExportPreset[];
  myLenses?: any;
  enableFolderImageCounts?: boolean;
  displayEditIcon?: boolean;
  linearRawMode?: string;
  enableXmpSync?: boolean;
  createXmpIfMissing?: boolean;
  isWaveformVisible?: boolean;
  waveformHeight?: number;
  activeWaveformChannel?: string;
  useWgpuRenderer?: boolean;
  canvasInputMode?: 'mouse' | 'trackpad';
  zoomSpeedMultiplier?: number;
  keybinds?: { [action: string]: string[] };
  tonemapperOverrideEnabled?: boolean;
  defaultRawTonemapper?: string;
  defaultNonRawTonemapper?: string;
  copyPasteSettings?: CopyPasteSettings;
  enableFocusMode?: boolean;
  openTreeSections?: string[];
  folderIcons?: Record<string, string>;
  exifOverlay?: ExifOverlay;
  language?: string;
  folderTreeSort?: FolderTreeSort;
  fontFamily?: string;
}

export interface BrushSettings {
  feather: number;
  size: number;
  tool: ToolType;
}

export enum LibraryViewMode {
  Flat = 'flat',
  Recursive = 'recursive',
}

export const EditedStatus = {
  All: 'all',
  EditedOnly: 'editedOnly',
  UneditedOnly: 'uneditedOnly',
} as const;

export type EditedStatus = (typeof EditedStatus)[keyof typeof EditedStatus];

export interface FilterCriteria {
  colors: Array<string>;
  rating: number;
  rawStatus: RawStatus;
  editedStatus?: EditedStatus;
}

export interface Folder {
  children: any;
  id?: string | undefined;
  name?: string | undefined;
  imageCount?: number;
}

export interface ImageFile {
  is_edited: boolean;
  modified: number;
  path: string;
  rating: number;
  tags: Array<string> | null;
  exif: { [key: string]: string } | null;
  is_virtual_copy: boolean;
  is_cloud_placeholder: boolean;
}

export interface Option {
  color?: string;
  disabled?: boolean;
  icon?: any;
  isDestructive?: boolean;
  label?: string;
  onClick?(): void;
  onRightClick?(): void;
  submenu?: any;
  type?: string;
}

export enum Orientation {
  Horizontal = 'horizontal',
  Vertical = 'vertical',
}

export interface Preset {
  adjustments: Partial<Adjustments>;
  folder?: Folder;
  id: string;
  name: string;
  includeMasks?: boolean;
  includeCropTransform?: boolean;
  presetType?: 'tool' | 'style' | 'portrait' | 'color' | 'ai-color' | 'combined';
}

export interface Progress {
  completed?: number;
  current?: number;
  total: number;
  stage?: string;
}

export interface SelectedImage {
  exif: any;
  height: number;
  isRaw: boolean;
  isReady: boolean;
  metadata?: any;
  original_base64?: string;
  originalUrl: string | null;
  path: string;
  thumbnailUrl: string;
  width: number;
}

export interface SortCriteria {
  key: string;
  label?: string;
  order: string;
}

export interface SupportedTypes {
  nonRaw: Array<string>;
  raw: Array<string>;
  extensions?: string[];
  mimeTypes?: string[];
}

export enum ThumbnailSize {
  Large = 'large',
  Medium = 'medium',
  Small = 'small',
  List = 'list',
}

export interface TransformState {
  positionX: number;
  positionY: number;
  scale: number;
}

export interface UiVisibility {
  folderTree: boolean;
  filmstrip: boolean;
}

export interface WaveformData {
  blue: string;
  green: string;
  height: number;
  luma: string;
  red: string;
  rgb: string;
  parade: string;
  vectorscope: string;
  width: number;
}

export interface CullingSettings {
  similarityThreshold: number;
  blurThreshold: number;
  groupSimilar: boolean;
  filterBlurry: boolean;
}

export interface ImageAnalysisResult {
  path: string;
  qualityScore: number;
  sharpnessMetric: number;
  centerFocusMetric: number;
  exposureMetric: number;
  width: number;
  height: number;
}

export interface CullGroup {
  representative: ImageAnalysisResult;
  duplicates: ImageAnalysisResult[];
}

export interface CullingSuggestions {
  similarGroups: CullGroup[];
  blurryImages: ImageAnalysisResult[];
  failedPaths: string[];
}

export interface KeybindHandler {
  shouldFire?: () => boolean;
  execute: (event: KeyboardEvent) => void;
}

export type AlbumItem = Album | AlbumGroup;

export interface Album {
  type: 'album';
  id: string;
  name: string;
  icon?: string;
  images: string[];
}

export interface AlbumGroup {
  type: 'group';
  id: string;
  name: string;
  icon?: string;
  children: AlbumItem[];
}
