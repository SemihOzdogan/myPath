const Tts = {
  getInitStatus: jest.fn().mockResolvedValue('success'),
  setDefaultLanguage: jest.fn().mockResolvedValue('success'),
  setDefaultRate: jest.fn().mockResolvedValue('success'),
  setDucking: jest.fn().mockResolvedValue('success'),
  speak: jest.fn().mockReturnValue('speech-id'),
  stop: jest.fn().mockResolvedValue(true),
};

export default Tts;
