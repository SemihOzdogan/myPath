const Geolocation = {
  requestAuthorization: jest.fn().mockResolvedValue('denied'),
  getCurrentPosition: jest.fn(),
  watchPosition: jest.fn(),
  clearWatch: jest.fn(),
};

export default Geolocation;
