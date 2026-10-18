#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <string.h>
#include <emscripten/emscripten.h>
#include "libretro.h"

#define TB_WIDTH 256
#define TB_HEIGHT 240
#define TB_AUDIO_CAPACITY 8192

static uint8_t tb_video[TB_WIDTH * TB_HEIGHT * 4];
static int16_t tb_audio[TB_AUDIO_CAPACITY * 2];
static size_t tb_audio_count;
static uint16_t tb_input[2];
static enum retro_pixel_format tb_format = RETRO_PIXEL_FORMAT_0RGB1555;
static double tb_rate;
static double tb_frame_rate;
static struct retro_game_info tb_game;
static struct retro_game_info_ext tb_game_ext;
static const char *tb_dir = ".";
static bool tb_sprite_limit_removal = true;
static bool tb_variables_dirty;

static bool tb_environment(unsigned cmd, void *data)
{
  switch (cmd) {
    case RETRO_ENVIRONMENT_SET_PIXEL_FORMAT: {
      enum retro_pixel_format fmt = *(const enum retro_pixel_format *)data;
      if (fmt != RETRO_PIXEL_FORMAT_XRGB8888 && fmt != RETRO_PIXEL_FORMAT_RGB565) return false;
      tb_format = fmt;
      return true;
    }
    case RETRO_ENVIRONMENT_GET_SYSTEM_DIRECTORY:
    case RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY:
      *(const char **)data = tb_dir;
      return true;
    case RETRO_ENVIRONMENT_GET_VARIABLE: {
      struct retro_variable *var = (struct retro_variable *)data;
      if (!var->key || strcmp(var->key, "mesen_nospritelimit") != 0) return false;
      var->value = tb_sprite_limit_removal ? "enabled" : "disabled";
      return true;
    }
    case RETRO_ENVIRONMENT_GET_VARIABLE_UPDATE:
      *(bool *)data = tb_variables_dirty;
      tb_variables_dirty = false;
      return true;
    case RETRO_ENVIRONMENT_GET_CAN_DUPE:
      *(bool *)data = true;
      return true;
    case RETRO_ENVIRONMENT_GET_GAME_INFO_EXT:
      if (!tb_game.data) return false;
      *(const struct retro_game_info_ext **)data = &tb_game_ext;
      return true;
    default:
      return false;
  }
}

static void tb_video_refresh(const void *data, unsigned width, unsigned height, size_t pitch)
{
  if (!data) return;
  unsigned w = width < TB_WIDTH ? width : TB_WIDTH;
  unsigned h = height < TB_HEIGHT ? height : TB_HEIGHT;
  const uint8_t *src = (const uint8_t *)data;
  for (unsigned y = 0; y < h; y++) {
    uint8_t *dst = tb_video + y * TB_WIDTH * 4;
    if (tb_format == RETRO_PIXEL_FORMAT_XRGB8888) {
      const uint32_t *row = (const uint32_t *)(src + y * pitch);
      for (unsigned x = 0; x < w; x++) {
        uint32_t p = row[x];
        dst[x * 4] = (uint8_t)(p >> 16);
        dst[x * 4 + 1] = (uint8_t)(p >> 8);
        dst[x * 4 + 2] = (uint8_t)p;
        dst[x * 4 + 3] = 255;
      }
    } else {
      const uint16_t *row = (const uint16_t *)(src + y * pitch);
      for (unsigned x = 0; x < w; x++) {
        uint16_t p = row[x];
        uint8_t r = (uint8_t)((p >> 11) & 0x1f);
        uint8_t g = (uint8_t)((p >> 5) & 0x3f);
        uint8_t b = (uint8_t)(p & 0x1f);
        dst[x * 4] = (uint8_t)((r << 3) | (r >> 2));
        dst[x * 4 + 1] = (uint8_t)((g << 2) | (g >> 4));
        dst[x * 4 + 2] = (uint8_t)((b << 3) | (b >> 2));
        dst[x * 4 + 3] = 255;
      }
    }
  }
}

static void tb_audio_sample(int16_t left, int16_t right)
{
  if (tb_audio_count >= TB_AUDIO_CAPACITY) return;
  tb_audio[tb_audio_count * 2] = left;
  tb_audio[tb_audio_count * 2 + 1] = right;
  tb_audio_count++;
}

static size_t tb_audio_batch(const int16_t *data, size_t frames)
{
  size_t room = TB_AUDIO_CAPACITY - tb_audio_count;
  size_t n = frames < room ? frames : room;
  memcpy(tb_audio + tb_audio_count * 2, data, n * 2 * sizeof(int16_t));
  tb_audio_count += n;
  return frames;
}

static void tb_input_poll(void)
{
}

static int16_t tb_input_state(unsigned port, unsigned device, unsigned index, unsigned id)
{
  if (port > 1 || device != RETRO_DEVICE_JOYPAD || index != 0) return 0;
  if (id == RETRO_DEVICE_ID_JOYPAD_MASK) return (int16_t)(tb_input[port] & 0x1ff);
  if (id > RETRO_DEVICE_ID_JOYPAD_A) return 0;
  return (int16_t)((tb_input[port] >> id) & 1);
}

EMSCRIPTEN_KEEPALIVE void tb_init(void)
{
  retro_set_environment(tb_environment);
  retro_init();
  retro_set_video_refresh(tb_video_refresh);
  retro_set_audio_sample(tb_audio_sample);
  retro_set_audio_sample_batch(tb_audio_batch);
  retro_set_input_poll(tb_input_poll);
  retro_set_input_state(tb_input_state);
}

EMSCRIPTEN_KEEPALIVE int tb_load_rom(const uint8_t *data, size_t len)
{
  memset(&tb_game, 0, sizeof(tb_game));
  tb_game.path = "tsb.nes";
  tb_game.data = data;
  tb_game.size = len;
  memset(&tb_game_ext, 0, sizeof(tb_game_ext));
  tb_game_ext.full_path = "tsb.nes";
  tb_game_ext.dir = tb_dir;
  tb_game_ext.name = "tsb";
  tb_game_ext.ext = "nes";
  tb_game_ext.data = data;
  tb_game_ext.size = len;
  tb_game_ext.file_in_archive = false;
  tb_game_ext.persistent_data = false;
  if (!retro_load_game(&tb_game)) return 0;
  retro_set_controller_port_device(0, RETRO_DEVICE_JOYPAD);
  retro_set_controller_port_device(1, RETRO_DEVICE_JOYPAD);
  struct retro_system_av_info av;
  memset(&av, 0, sizeof(av));
  retro_get_system_av_info(&av);
  tb_rate = av.timing.sample_rate;
  tb_frame_rate = av.timing.fps;
  return 1;
}

EMSCRIPTEN_KEEPALIVE void tb_set_input(int port, int mask)
{
  if (port < 0 || port > 1) return;
  tb_input[port] = (uint16_t)mask;
}

EMSCRIPTEN_KEEPALIVE void tb_set_sprite_limit_removal(int enabled)
{
  tb_sprite_limit_removal = enabled != 0;
  tb_variables_dirty = true;
}

EMSCRIPTEN_KEEPALIVE void tb_run_frame(void)
{
  tb_audio_count = 0;
  retro_run();
}

EMSCRIPTEN_KEEPALIVE uint8_t *tb_video_ptr(void)
{
  return tb_video;
}

EMSCRIPTEN_KEEPALIVE int16_t *tb_audio_ptr(void)
{
  return tb_audio;
}

EMSCRIPTEN_KEEPALIVE int tb_audio_frames(void)
{
  return (int)tb_audio_count;
}

EMSCRIPTEN_KEEPALIVE double tb_sample_rate(void)
{
  return tb_rate;
}

EMSCRIPTEN_KEEPALIVE double tb_fps(void)
{
  return tb_frame_rate;
}

EMSCRIPTEN_KEEPALIVE void *tb_ram_ptr(void)
{
  return retro_get_memory_data(RETRO_MEMORY_SYSTEM_RAM);
}

EMSCRIPTEN_KEEPALIVE int tb_ram_size(void)
{
  return (int)retro_get_memory_size(RETRO_MEMORY_SYSTEM_RAM);
}

EMSCRIPTEN_KEEPALIVE void *tb_sram_ptr(void)
{
  return retro_get_memory_data(RETRO_MEMORY_SAVE_RAM);
}

EMSCRIPTEN_KEEPALIVE int tb_sram_size(void)
{
  return (int)retro_get_memory_size(RETRO_MEMORY_SAVE_RAM);
}

EMSCRIPTEN_KEEPALIVE int tb_state_size(void)
{
  return (int)retro_serialize_size();
}

EMSCRIPTEN_KEEPALIVE int tb_save_state(void *data, size_t len)
{
  return retro_serialize(data, len) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int tb_load_state(const void *data, size_t len)
{
  return retro_unserialize(data, len) ? 1 : 0;
}

extern size_t tb_core_ppu_dump(uint8_t *out) __attribute__((weak));

static uint8_t tb_ppu[0x4105];

EMSCRIPTEN_KEEPALIVE uint8_t *tb_ppu_ptr(void)
{
  return tb_ppu;
}

EMSCRIPTEN_KEEPALIVE int tb_ppu_dump(void)
{
  return tb_core_ppu_dump ? (int)tb_core_ppu_dump(tb_ppu) : 0;
}
