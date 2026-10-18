export interface CoreModule {
  _tb_init(): void
  _tb_load_rom(ptr: number, len: number): number
  _tb_set_input(port: 0 | 1, mask: number): void
  _tb_set_sprite_limit_removal(enabled: 0 | 1): void
  _tb_run_frame(): void
  _tb_video_ptr(): number
  _tb_audio_ptr(): number
  _tb_audio_frames(): number
  _tb_sample_rate(): number
  _tb_fps(): number
  _tb_ram_ptr(): number
  _tb_ram_size(): number
  _tb_sram_ptr(): number
  _tb_sram_size(): number
  _tb_state_size(): number
  _tb_save_state(ptr: number, len: number): number
  _tb_load_state(ptr: number, len: number): number
  _tb_ppu_ptr(): number
  _tb_ppu_dump(): number
  _malloc(size: number): number
  _free(ptr: number): void
  HEAPU8: Uint8Array
  HEAP16: Int16Array
}

export interface CoreOptions {
  wasmBinary?: ArrayBuffer | Uint8Array
  locateFile?(path: string, prefix: string): string
}

export type CreateCore = (options?: CoreOptions) => Promise<CoreModule>
